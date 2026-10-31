/**
 * Integration tests for git sync: real git, real repositories in a temp folder.
 * Each test builds a "remote" (bare repo, standing in for GitHub) and two clones —
 * `me` and `teammate` — and drives git-service the way the Git Sync panel does.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');
const gitService = require('./git-service');

jest.setTimeout(60000);

const REQUEST_TEMPLATE = (name, url) => `info:\n  name: ${name}\n  type: http\n  seq: 1\n\nhttp:\n  method: GET\n  url: ${url}\n  auth: inherit\n\nsettings:\n  timeout: 0\n`;

let tmpRoot;
let originalEnv;

beforeAll(() => {
  originalEnv = { ...process.env };
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-git-sync-'));

  // Keep the developer's own git config (signing, hooks, default branch) out of the tests.
  const emptyConfig = path.join(tmpRoot, 'empty-gitconfig');
  fs.writeFileSync(emptyConfig, '');
  process.env.GIT_CONFIG_GLOBAL = emptyConfig;
  process.env.GIT_CONFIG_NOSYSTEM = '1';
  process.env.GIT_TERMINAL_PROMPT = '0';
});

afterAll(() => {
  process.env = originalEnv;
  fs.rmSync(tmpRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
});

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().trim();

let teamCount = 0;
const createTeam = () => {
  const dir = path.join(tmpRoot, `team-${++teamCount}`);
  const remote = path.join(dir, 'remote.git');
  const me = path.join(dir, 'me');
  const teammate = path.join(dir, 'teammate');
  fs.mkdirSync(dir);

  git(dir, 'init', '-q', '--bare', '-b', 'main', remote);
  git(dir, 'clone', '-q', remote, me);
  for (const repo of [me]) {
    git(repo, 'config', 'user.name', 'Me');
    git(repo, 'config', 'user.email', 'me@example.com');
  }

  const write = (repo, file, content) => fs.writeFileSync(path.join(repo, file), content);
  const read = (repo, file) => fs.readFileSync(path.join(repo, file), 'utf8');
  const exists = (repo, file) => fs.existsSync(path.join(repo, file));
  const mergeInProgress = (repo) => fs.existsSync(path.join(repo, '.git', 'MERGE_HEAD'));

  const commitAll = async (repo, message) => {
    await gitService.stageAll(repo);
    const result = await gitService.commit(repo, message);
    expect(result.success).toBe(true);
  };

  // Shared starting point: both people have the same Posts.yml and Users.yml.
  const setup = async () => {
    write(me, 'Posts.yml', REQUEST_TEMPLATE('Posts', 'https://example.com/posts'));
    write(me, 'Users.yml', REQUEST_TEMPLATE('Users', 'https://example.com/users'));
    await commitAll(me, 'initial');
    expect((await gitService.push(me)).success).toBe(true);

    git(dir, 'clone', '-q', remote, teammate);
    git(teammate, 'config', 'user.name', 'Teammate');
    git(teammate, 'config', 'user.email', 'teammate@example.com');
  };

  const setUrl = (repo, file, url) => write(repo, file, read(repo, file).replace(/url: .*/, `url: ${url}`));

  return { me, teammate, write, read, exists, mergeInProgress, commitAll, setup, setUrl };
};

/**
 * Teammate pushes their edits first; I commit mine without pulling.
 * Leaves `me` one commit ahead and one behind.
 */
const diverge = async (team, { teammateEdits, myEdits }) => {
  await gitService.pull(team.teammate);
  teammateEdits(team.teammate);
  await team.commitAll(team.teammate, 'teammate change');
  expect((await gitService.push(team.teammate)).success).toBe(true);

  myEdits(team.me);
  await team.commitAll(team.me, 'my change');
};

describe('commit', () => {
  it('refuses to commit when nothing is staged instead of silently creating no commit', async () => {
    const team = createTeam();
    team.write(team.me, 'Posts.yml', REQUEST_TEMPLATE('Posts', 'https://example.com/posts'));

    const result = await gitService.commit(team.me, 'nothing staged');

    expect(result).toMatchObject({ success: false, code: 'NOTHING_STAGED' });
  });
});

describe('push', () => {
  it('pushes to an empty remote and sets upstream tracking', async () => {
    const team = createTeam();
    team.write(team.me, 'Posts.yml', REQUEST_TEMPLATE('Posts', 'https://example.com/posts'));
    await team.commitAll(team.me, 'first');

    expect((await gitService.getStatus(team.me)).ahead).toBe(1);
    expect((await gitService.push(team.me)).success).toBe(true);
    expect(git(team.me, 'rev-parse', '--abbrev-ref', 'main@{upstream}')).toBe('origin/main');
  });

  it('reports a readable rejection when the remote has commits I do not have', async () => {
    const team = createTeam();
    await team.setup();
    await diverge(team, {
      teammateEdits: (repo) => team.setUrl(repo, 'Users.yml', 'https://example.com/users?by=teammate'),
      myEdits: (repo) => team.setUrl(repo, 'Posts.yml', 'https://example.com/posts?by=me')
    });

    const result = await gitService.push(team.me);

    expect(result).toMatchObject({ success: false, code: 'PUSH_REJECTED' });
    expect(result.error).toMatch(/Pull first/);
  });
});

describe('status', () => {
  it('counts commits to push and commits on the remote after a fetch', async () => {
    const team = createTeam();
    await team.setup();
    await diverge(team, {
      teammateEdits: (repo) => team.setUrl(repo, 'Users.yml', 'https://example.com/users?by=teammate'),
      myEdits: (repo) => team.setUrl(repo, 'Posts.yml', 'https://example.com/posts?by=me')
    });

    await gitService.fetchRemote(team.me);
    const status = await gitService.getStatus(team.me);

    expect(status).toMatchObject({ ahead: 1, behind: 1, hasRemote: true, mergeInProgress: false });
  });
});

describe('pull', () => {
  it('merges diverged branches that touched different files, whatever pull.rebase is set to', async () => {
    const team = createTeam();
    await team.setup();
    await diverge(team, {
      teammateEdits: (repo) => team.setUrl(repo, 'Users.yml', 'https://example.com/users?by=teammate'),
      myEdits: (repo) => team.setUrl(repo, 'Posts.yml', 'https://example.com/posts?by=me')
    });

    const result = await gitService.pull(team.me);

    expect(result.success).toBe(true);
    expect(team.read(team.me, 'Users.yml')).toMatch(/by=teammate/);
    expect(team.read(team.me, 'Posts.yml')).toMatch(/by=me/);
    expect((await gitService.push(team.me)).success).toBe(true);
  });

  it('refuses to pull over an uncommitted local edit to a file that changed on the remote', async () => {
    const team = createTeam();
    await team.setup();
    team.setUrl(team.teammate, 'Posts.yml', 'https://example.com/posts?by=teammate');
    await team.commitAll(team.teammate, 'teammate change');
    await gitService.push(team.teammate);
    team.setUrl(team.me, 'Posts.yml', 'https://example.com/posts?uncommitted');

    const result = await gitService.pull(team.me);

    expect(result).toMatchObject({ success: false, code: 'LOCAL_CHANGES' });
    expect(team.read(team.me, 'Posts.yml')).toMatch(/uncommitted/);
  });

  it('cancels a conflicting pull, leaves no conflict markers, and reports the clashing lines', async () => {
    const team = createTeam();
    await team.setup();
    await diverge(team, {
      teammateEdits: (repo) => team.setUrl(repo, 'Posts.yml', 'https://example.com/posts?by=teammate'),
      myEdits: (repo) => team.setUrl(repo, 'Posts.yml', 'https://example.com/posts?by=me')
    });

    const result = await gitService.pull(team.me);

    expect(result).toMatchObject({ success: false, code: 'MERGE_CONFLICT', conflicts: ['Posts.yml'] });
    expect(result.conflictDetails).toEqual([
      {
        file: 'Posts.yml',
        hunks: [{ ours: '  url: https://example.com/posts?by=me', theirs: '  url: https://example.com/posts?by=teammate' }]
      }
    ]);
    expect(team.mergeInProgress(team.me)).toBe(false);
    expect(team.read(team.me, 'Posts.yml')).not.toMatch(/<<<<<<<|>>>>>>>/);
    expect(team.read(team.me, 'Posts.yml')).toMatch(/by=me/);
  });
});

describe('resolveConflicts (choose a version per file)', () => {
  const conflictOnBothFiles = async (team) => {
    await team.setup();
    await diverge(team, {
      teammateEdits: (repo) => {
        team.setUrl(repo, 'Posts.yml', 'https://example.com/posts?by=teammate');
        team.setUrl(repo, 'Users.yml', 'https://example.com/users?by=teammate');
        team.write(repo, 'Comments.yml', REQUEST_TEMPLATE('Comments', 'https://example.com/comments'));
      },
      myEdits: (repo) => {
        team.write(repo, 'Posts.yml', team.read(repo, 'Posts.yml').replace(/url: .*/, 'url: https://example.com/posts?by=me') + 'docs: only in my version\n');
        team.setUrl(repo, 'Users.yml', 'https://example.com/users?by=me');
      }
    });
    expect((await gitService.pull(team.me)).code).toBe('MERGE_CONFLICT');
  };

  it('rolls back when a file has no choice', async () => {
    const team = createTeam();
    await conflictOnBothFiles(team);

    const result = await gitService.resolveConflicts(team.me, { 'Posts.yml': 'ours' });

    expect(result).toMatchObject({ success: false, code: 'CHOICE_MISSING' });
    expect(team.mergeInProgress(team.me)).toBe(false);
    expect(team.read(team.me, 'Users.yml')).toMatch(/by=me/);
  });

  it('takes each conflicted file whole from the chosen side and keeps non-conflicting changes', async () => {
    const team = createTeam();
    await conflictOnBothFiles(team);

    const result = await gitService.resolveConflicts(team.me, { 'Posts.yml': 'theirs', 'Users.yml': 'ours' });

    expect(result.success).toBe(true);
    // "theirs" is the teammate's whole file: my extra line in the same file is gone too
    expect(team.read(team.me, 'Posts.yml')).toBe(git(team.me, 'show', 'origin/main:Posts.yml') + '\n');
    expect(team.read(team.me, 'Users.yml')).toMatch(/by=me/);
    expect(team.exists(team.me, 'Comments.yml')).toBe(true);

    const status = await gitService.getStatus(team.me);
    expect(status).toMatchObject({ mergeInProgress: false, isClean: true });
    expect((await gitService.push(team.me)).success).toBe(true);
  });

  it.each([
    ['theirs', 'removes the file the teammate deleted', false],
    ['ours', 'keeps my edited file', true]
  ])('modify/delete conflict resolved with %s %s', async (side, _description, shouldExist) => {
    const team = createTeam();
    await team.setup();
    await diverge(team, {
      teammateEdits: (repo) => git(repo, 'rm', '-q', 'Users.yml'),
      myEdits: (repo) => team.setUrl(repo, 'Users.yml', 'https://example.com/users?by=me')
    });
    expect((await gitService.pull(team.me)).conflicts).toEqual(['Users.yml']);

    const result = await gitService.resolveConflicts(team.me, { 'Users.yml': side });

    expect(result.success).toBe(true);
    expect(team.exists(team.me, 'Users.yml')).toBe(shouldExist);
    expect(git(team.me, 'ls-tree', '--name-only', 'HEAD').split('\n').includes('Users.yml')).toBe(shouldExist);
  });

  /*
   * Regression: any failure while taking a side used to be treated as "that side
   * deleted the file", so the file was silently removed from the merge commit. Deletion
   * must come only from the index saying the chosen side has no version of the file.
   */
  describe('takeSide', () => {
    const unmergedBothSides = '100644 aaa 1\tPosts.yml\n100644 bbb 2\tPosts.yml\n100644 ccc 3\tPosts.yml\n';
    const unmergedDeletedByThem = '100644 aaa 1\tPosts.yml\n100644 bbb 2\tPosts.yml\n';

    const fakeGit = (unmergedEntries, checkoutError) => ({
      raw: jest.fn(async (args) => {
        if (args[0] === 'ls-files') {
          return unmergedEntries;
        }
        if (args[0] === 'checkout' && checkoutError) {
          throw checkoutError;
        }
        return '';
      }),
      add: jest.fn(async () => {})
    });
    const removedFile = (git) => git.raw.mock.calls.some(([args]) => args[0] === 'rm');

    it('surfaces a failure instead of deleting the file when the chosen side has it', async () => {
      const git = fakeGit(unmergedBothSides, new Error('something went wrong'));

      await expect(gitService.takeSide(git, 'Posts.yml', 'ours')).rejects.toThrow('something went wrong');
      expect(removedFile(git)).toBe(false);
    });

    it('removes the file only when the chosen side deleted it', async () => {
      const theirsDeleted = fakeGit(unmergedDeletedByThem);
      await gitService.takeSide(theirsDeleted, 'Posts.yml', 'theirs');
      expect(removedFile(theirsDeleted)).toBe(true);

      const oursKept = fakeGit(unmergedDeletedByThem);
      await gitService.takeSide(oursKept, 'Posts.yml', 'ours');
      expect(removedFile(oursKept)).toBe(false);
      expect(oursKept.add).toHaveBeenCalledWith('Posts.yml');
    });
  });

  // The collection watcher runs `git status` whenever a file changes, so resolving
  // (which rewrites files) always races with status calls.
  it.each([
    ['without optional locks (like Bruno\'s watcher)', 'GIT_OPTIONAL_LOCKS=0 '],
    ['with locks (like another tool on the repo)', '']
  ])('never drops a file while git status runs concurrently %s', async (_label, statusEnv) => {
    const team = createTeam();
    await conflictOnBothFiles(team);

    const statusLoop = spawn('bash', ['-c', `while true; do ${statusEnv}git -C "${team.me}" status >/dev/null 2>&1; done`], {
      detached: true
    });
    let result;
    try {
      result = await gitService.resolveConflicts(team.me, { 'Posts.yml': 'ours', 'Users.yml': 'ours' });
    } finally {
      process.kill(-statusLoop.pid, 'SIGKILL');
    }

    // Under heavy external locking the resolve may give up, but it must do so cleanly.
    expect(team.mergeInProgress(team.me)).toBe(false);
    expect(team.exists(team.me, 'Posts.yml')).toBe(true);
    expect(team.exists(team.me, 'Users.yml')).toBe(true);
    if (result.success) {
      expect(team.read(team.me, 'Posts.yml')).toMatch(/only in my version/);
      expect(team.read(team.me, 'Users.yml')).toMatch(/by=me/);
    }
  });
});

describe('manual merge (resolve in an editor)', () => {
  const startConflictedManualMerge = async (team) => {
    await team.setup();
    await diverge(team, {
      teammateEdits: (repo) => team.setUrl(repo, 'Posts.yml', 'https://example.com/posts?by=teammate'),
      myEdits: (repo) => team.setUrl(repo, 'Posts.yml', 'https://example.com/posts?by=me')
    });
    await gitService.pull(team.me);
    return gitService.startManualMerge(team.me);
  };

  it('leaves the merge open with markers and tracks which files still need fixing', async () => {
    const team = createTeam();

    const result = await startConflictedManualMerge(team);

    expect(result).toMatchObject({ success: true, conflicts: ['Posts.yml'], merged: false });
    expect(team.read(team.me, 'Posts.yml')).toMatch(/<<<<<<</);
    expect(await gitService.getStatus(team.me)).toMatchObject({ mergeInProgress: true, unresolved: ['Posts.yml'] });
  });

  it('does not auto-stage files during the merge, since staging marks a conflict as resolved', async () => {
    const team = createTeam();
    await startConflictedManualMerge(team);

    const result = await gitService.stageFile(team.me, path.join(team.me, 'Posts.yml'));

    expect(result.skipped).toBe(true);
    expect((await gitService.getStatus(team.me)).conflicted).toEqual(['Posts.yml']);
  });

  it('refuses to finish while conflict markers remain, then finishes once they are fixed', async () => {
    const team = createTeam();
    await startConflictedManualMerge(team);

    expect(await gitService.finishMerge(team.me)).toMatchObject({ success: false, code: 'UNRESOLVED_MARKERS' });
    expect(team.mergeInProgress(team.me)).toBe(true);

    const handEdited = team
      .read(team.me, 'Posts.yml')
      .split('\n')
      .filter((line) => !/^(<<<<<<<|=======|>>>>>>>)/.test(line) && !/by=teammate/.test(line))
      .join('\n');
    team.write(team.me, 'Posts.yml', handEdited);
    expect((await gitService.getStatus(team.me)).unresolved).toEqual([]);

    expect((await gitService.finishMerge(team.me)).success).toBe(true);
    expect(team.mergeInProgress(team.me)).toBe(false);
    expect(team.read(team.me, 'Posts.yml')).toMatch(/by=me/);
    expect((await gitService.push(team.me)).success).toBe(true);
  });

  it('refuses to finish when a resolved file is no longer a valid request ("Accept Both" on url)', async () => {
    const team = createTeam();
    await startConflictedManualMerge(team);

    // What VS Code's "Accept Both" produces: markers gone, but two `url:` keys
    const bothKept = team
      .read(team.me, 'Posts.yml')
      .split('\n')
      .filter((line) => !/^(<<<<<<<|=======|>>>>>>>)/.test(line))
      .join('\n');
    team.write(team.me, 'Posts.yml', bothKept);
    git(team.me, 'add', 'Posts.yml'); // VS Code's "Complete Merge" stages the file

    const status = await gitService.getStatus(team.me);
    expect(status.unresolved).toEqual([]);
    expect(status.invalid).toEqual([{ file: 'Posts.yml', error: expect.stringMatching(/unique/i) }]);

    expect(await gitService.finishMerge(team.me)).toMatchObject({ success: false, code: 'INVALID_FILES' });
    expect(team.mergeInProgress(team.me)).toBe(true);
  });

  it('cancelling restores my files exactly as they were', async () => {
    const team = createTeam();
    await startConflictedManualMerge(team);

    expect((await gitService.abortMerge(team.me)).success).toBe(true);

    expect(team.mergeInProgress(team.me)).toBe(false);
    expect(team.read(team.me, 'Posts.yml')).toMatch(/by=me/);
    expect(team.read(team.me, 'Posts.yml')).not.toMatch(/<<<<<<</);
    expect(await gitService.finishMerge(team.me)).toMatchObject({ success: false, code: 'NO_MERGE' });
  });
});

describe('auto-stage lock', () => {
  it('skips staging while a pull is running on the same collection', async () => {
    const team = createTeam();
    await team.setup();

    const pulling = gitService.pull(team.me);
    const staged = await gitService.stageFile(team.me, path.join(team.me, 'Posts.yml'));
    await pulling;

    expect(staged.skipped).toBe(true);
    expect((await gitService.stageFile(team.me, path.join(team.me, 'Posts.yml'))).skipped).toBeUndefined();
  });
});
