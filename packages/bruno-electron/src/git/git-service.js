const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');
const { parseCollection, parseEnvironment, parseFolder, parseRequest } = require('@usebruno/filestore');

const DEFAULT_REMOTE = 'origin';
const CONFLICT_SIDES = ['ours', 'theirs'];
const CONFLICT_MARKER = /^(<{7}|>{7})(\s|$)/m;
// In a conflicted file's index entries, stage 2 is our version and stage 3 is theirs.
const CONFLICT_STAGE = { ours: '2', theirs: '3' };
const INDEX_LOCKED = /index\.lock'?: File exists/i;

/**
 * GIT_OPTIONAL_LOCKS=0 stops read-only commands (`git status`, which the collection
 * watcher and the panel run constantly) from taking the index lock. Without it, a status
 * refresh triggered by our own file writes makes the next `git add` fail mid-merge.
 */
const createGit = (baseDir) => simpleGit(baseDir).env({ ...process.env, GIT_OPTIONAL_LOCKS: '0' });

/**
 * Retry an index-writing git command while another process (an editor's git
 * integration, a terminal) briefly holds the index lock.
 */
const retryWhileIndexLocked = async (operation, attempts = 5) => {
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || !INDEX_LOCKED.test(error.message)) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 100 * attempt));
    }
  }
};

// Ordered: the first matching pattern wins.
const GIT_ERROR_DESCRIPTIONS = [
  {
    code: 'PUSH_REJECTED',
    pattern: /\[rejected\]|fetch first|non-fast-forward/i,
    message: 'The remote has changes you don\'t have yet. Pull first, then push.'
  },
  {
    code: 'LOCAL_CHANGES',
    pattern: /would be overwritten by merge|commit your changes or stash them/i,
    message: 'You have uncommitted changes to files that also changed on the remote. Commit them first, then pull.'
  },
  {
    code: 'UNTRACKED_IN_THE_WAY',
    pattern: /untracked working tree files would be overwritten/i,
    message: 'Some new local files have the same name as files on the remote. Stage and commit them first, then pull.'
  },
  {
    code: 'REMOTE_BRANCH_MISSING',
    pattern: /couldn't find remote ref|no such ref was fetched/i,
    message: 'This branch doesn\'t exist on the remote yet. Push first.'
  },
  {
    code: 'MERGE_IN_PROGRESS',
    pattern: /you have not concluded your merge|merge_head exists/i,
    message: 'A merge is still in progress. Finish or cancel it in the Git Sync panel first.'
  },
  {
    code: 'NO_REMOTE',
    pattern: /does not appear to be a git repository|no such remote|no configured push destination/i,
    message: 'No remote repository is set. Add one in Collection Settings → Git Sync.'
  },
  {
    code: 'AUTH_FAILED',
    pattern: /authentication failed|could not read username|permission denied|403|terminal prompts disabled/i,
    message: 'The remote rejected your credentials. Check that you are signed in to git (SSH key or HTTPS token) and have access to this repository.'
  },
  {
    code: 'NETWORK',
    pattern: /could not resolve host|unable to access|connection timed out|network is unreachable/i,
    message: 'Couldn\'t reach the remote. Check your internet connection and try again.'
  }
];

/**
 * Split a file containing conflict markers into its conflicting sections. Handles the
 * diff3 style too, where a `|||||||` section holds the common ancestor (not shown).
 */
const parseConflictHunks = (content) => {
  const hunks = [];
  let current = null;
  let section = null;

  for (const line of content.split(/\r\n|\r|\n/)) {
    if (line.startsWith('<<<<<<<')) {
      current = { ours: [], theirs: [] };
      section = 'ours';
    } else if (current && line.startsWith('|||||||')) {
      section = 'base';
    } else if (current && line.startsWith('=======')) {
      section = 'theirs';
    } else if (current && line.startsWith('>>>>>>>')) {
      hunks.push({ ours: current.ours.join('\n'), theirs: current.theirs.join('\n') });
      current = null;
      section = null;
    } else if (current && section !== 'base') {
      current[section].push(line);
    }
  }

  return hunks;
};

class GitService {
  constructor() {
    // Collections with a pull/commit/push in progress. Auto-stage skips these so it
    // never runs `git add` while another git process holds the index lock.
    this.busyCollections = new Set();
  }

  isBusy(collectionPath) {
    return this.busyCollections.has(path.resolve(collectionPath));
  }

  async withLock(collectionPath, operation) {
    const key = path.resolve(collectionPath);
    this.busyCollections.add(key);
    try {
      return await operation();
    } finally {
      this.busyCollections.delete(key);
    }
  }

  /**
   * Turn a raw git error into { code, error } with a message a non-git user can act on.
   * The raw output is kept in `details` for debugging.
   */
  describeError(error) {
    const raw = (error && error.message) || String(error);
    const match = GIT_ERROR_DESCRIPTIONS.find(({ pattern }) => pattern.test(raw));

    if (!match) {
      return { success: false, code: 'UNKNOWN', error: raw.trim() };
    }

    return { success: false, code: match.code, error: match.message, details: raw.trim() };
  }

  /**
   * Check if directory is a git repository
   */
  async isGitRepo(collectionPath) {
    try {
      const git = createGit(collectionPath);
      await git.status();
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Initialize new git repository
   */
  async initializeRepo(collectionPath) {
    const git = createGit(collectionPath);
    await git.init();

    // Create default .gitignore
    const gitignorePath = path.join(collectionPath, '.gitignore');
    const gitignoreContent = `
# Dependencies
node_modules/

# System files
.DS_Store
*.log

# Environment files
.env
.env.local
.env.*.local

# Bruno environments (contain secrets)
environments/

# Bruno secret files
*.secrets.bru

# IMPORTANT: Review all .bru files before committing
# Make sure they don't contain:
# - Real API keys (use environment variables instead)
# - Passwords or tokens
# - Sensitive data in request bodies
#
# Use Bruno's environment variables for sensitive data
`.trim();

    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, gitignoreContent);
    }

    return { success: true };
  }

  async hasCommits(git) {
    try {
      await git.revparse(['--verify', 'HEAD']);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Commits only on this side (ahead) and only on the remote (behind), measured
   * against the last fetched remote-tracking branch. Before the first push there is
   * no remote branch, so every local commit counts as unpushed.
   */
  async getAheadBehind(git, branch, hasCommits) {
    if (!hasCommits) {
      return { ahead: 0, behind: 0 };
    }

    const remoteBranch = `${DEFAULT_REMOTE}/${branch}`;
    try {
      await git.revparse(['--verify', remoteBranch]);
    } catch (err) {
      const count = await git.raw(['rev-list', '--count', 'HEAD']);
      return { ahead: Number(count.trim()) || 0, behind: 0 };
    }

    const counts = await git.raw(['rev-list', '--left-right', '--count', `HEAD...${remoteBranch}`]);
    const [ahead, behind] = counts.trim().split(/\s+/).map(Number);
    return { ahead: ahead || 0, behind: behind || 0 };
  }

  /**
   * Get current repository status
   */
  async getStatus(collectionPath) {
    const git = createGit(collectionPath);
    const status = await git.status();

    // Combine modified and untracked files, but exclude files that are already staged
    const stagedFiles = new Set(status.staged);
    const modifiedFiles = [...status.modified, ...status.not_added].filter((file) => !stagedFiles.has(file));

    const remotes = await git.getRemotes();
    const hasRemote = remotes.some((r) => r.name === DEFAULT_REMOTE);
    const hasCommits = await this.hasCommits(git);
    const { ahead, behind } = hasRemote
      ? await this.getAheadBehind(git, status.current, hasCommits)
      : { ahead: 0, behind: 0 };
    const mergeInProgress = await this.isMergeInProgress(git);

    return {
      branch: status.current,
      staged: status.staged,
      modified: modifiedFiles, // Only unstaged modified/untracked files
      untracked: status.not_added,
      created: status.created,
      deleted: status.deleted,
      renamed: status.renamed,
      conflicted: status.conflicted,
      mergeInProgress,
      // Conflicted files that still contain conflict markers, i.e. not yet fixed in the editor
      unresolved: mergeInProgress ? this.filesWithConflictMarkers(collectionPath, status.conflicted) : [],
      // Merged files Bruno can't parse, as [{ file, error }]
      invalid: mergeInProgress ? await this.findInvalidFiles(collectionPath, this.mergeTouchedFiles(status)) : [],
      ahead,
      behind,
      hasRemote,
      hasCommits,
      isClean: status.isClean()
    };
  }

  async isMergeInProgress(git) {
    try {
      // No `-q`: simple-git only rejects when git writes to stderr, so a quiet failure would read as success.
      await git.revparse(['--verify', 'MERGE_HEAD']);
      return true;
    } catch (err) {
      return false;
    }
  }

  filesWithConflictMarkers(collectionPath, files) {
    return files.filter((file) => {
      const filePath = path.join(collectionPath, file);
      return fs.existsSync(filePath) && CONFLICT_MARKER.test(fs.readFileSync(filePath, 'utf8'));
    });
  }

  /**
   * Parse a collection file with the same parser Bruno uses to load it, so a hand-merged
   * file that Bruno couldn't open (e.g. "Accept Both" leaving two `url:` keys) is caught
   * before it is committed. Returns an error message, or null when the file is fine or
   * isn't a collection file.
   */
  async validateCollectionFile(collectionPath, file) {
    const filePath = path.join(collectionPath, file);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const extension = path.extname(file).toLowerCase();
    const format = extension === '.bru' ? 'bru' : ['.yml', '.yaml'].includes(extension) ? 'yml' : null;
    const isRootFile = path.dirname(file) === '.';
    const content = fs.readFileSync(filePath, 'utf8');

    try {
      if (isRootFile && file === 'bruno.json') {
        JSON.parse(content);
      } else if (!format) {
        return null;
      } else if (isRootFile && ['collection.bru', 'opencollection.yml'].includes(file)) {
        await parseCollection(content, { format });
      } else if (['folder.bru', 'folder.yml'].includes(path.basename(file))) {
        await parseFolder(content, { format });
      } else if (path.dirname(file).split(/[\\/]/)[0] === 'environments') {
        await parseEnvironment(content, { format });
      } else {
        await parseRequest(content, { format });
      }
      return null;
    } catch (error) {
      return String(error && error.message ? error.message : error).split(/\r\n|\r|\n/)[0];
    }
  }

  async findInvalidFiles(collectionPath, files) {
    const invalid = [];
    for (const file of files) {
      const error = await this.validateCollectionFile(collectionPath, file);
      if (error) {
        invalid.push({ file, error });
      }
    }
    return invalid;
  }

  // Files touched by the merge in progress: still conflicted, or already staged by the
  // user's editor (VS Code's "Complete Merge" stages a file as soon as it is resolved).
  mergeTouchedFiles(status) {
    return [...new Set([...status.conflicted, ...status.staged, ...status.modified])];
  }

  /**
   * Update remote-tracking branches so ahead/behind reflect the remote. Network
   * failures are not errors here: status still works offline from the last fetch.
   */
  async fetchRemote(collectionPath) {
    const git = createGit(collectionPath);
    const remotes = await git.getRemotes();

    if (!remotes.some((r) => r.name === DEFAULT_REMOTE)) {
      return { success: true, fetched: false };
    }

    try {
      await git.fetch(DEFAULT_REMOTE);
      return { success: true, fetched: true };
    } catch (error) {
      return { ...this.describeError(error), fetched: false };
    }
  }

  /**
   * Stage all changes
   */
  async stageAll(collectionPath) {
    const git = createGit(collectionPath);
    await retryWhileIndexLocked(() => git.add('./*'));
    return { success: true };
  }

  /**
   * Unstage specific file
   */
  async unstageFile(collectionPath, filePath) {
    const git = createGit(collectionPath);
    // If filePath is already relative (doesn't start with /), use it directly
    // Otherwise, convert absolute path to relative
    const relativePath = path.isAbsolute(filePath)
      ? path.relative(collectionPath, filePath)
      : filePath;

    // Check if there are any commits in the repository
    try {
      await git.revparse(['HEAD']);
      // HEAD exists, use reset
      await git.reset(['HEAD', relativePath]);
    } catch (error) {
      // No commits yet (brand new repo), use rm --cached
      await git.raw(['rm', '--cached', relativePath]);
    }

    return { success: true };
  }

  /**
   * Stage specific file. Skipped while a pull/commit/push is running on the same
   * collection (those hold the index lock), and while a merge is being resolved in an
   * editor: staging a conflicted file tells git it is resolved, even with markers left.
   */
  async stageFile(collectionPath, filePath) {
    if (this.isBusy(collectionPath)) {
      return { success: true, skipped: true };
    }

    const git = createGit(collectionPath);
    if (await this.isMergeInProgress(git)) {
      return { success: true, skipped: true };
    }

    const relativePath = path.relative(collectionPath, filePath);
    await retryWhileIndexLocked(() => git.add(relativePath));
    return { success: true };
  }

  /**
   * Scan staged files for potential secrets
   */
  scanForSecrets(collectionPath, stagedFiles) {
    const warnings = [];
    const secretPatterns = [
      { pattern: /x-api-key:\s*[a-zA-Z0-9_-]{10,}/i, type: 'X-API-Key header' },
      { pattern: /apikey:\s*[a-zA-Z0-Z0-9_-]{10,}/i, type: 'API Key' },
      { pattern: /authorization:\s*bearer\s+[a-zA-Z0-9_-]{10,}/i, type: 'Bearer token' },
      { pattern: /password:\s*[^\s]{5,}/i, type: 'Password' },
      { pattern: /secret[_-]?key:\s*[a-zA-Z0-9_-]{10,}/i, type: 'Secret key' },
      { pattern: /api[_-]?secret:\s*[a-zA-Z0-9_-]{10,}/i, type: 'API secret' }
    ];

    for (const file of stagedFiles) {
      if (file.endsWith('.bru')) {
        const filePath = path.join(collectionPath, file);
        const content = fs.readFileSync(filePath, 'utf8');

        for (const { pattern, type } of secretPatterns) {
          if (pattern.test(content)) {
            warnings.push({ file, type });
          }
        }
      }
    }

    return warnings;
  }

  /**
   * Create commit
   */
  async commit(collectionPath, message) {
    const git = createGit(collectionPath);
    const status = await git.status();

    // `git commit` with an empty index exits cleanly without creating a commit, which
    // would make a following push fail with a confusing "src refspec" error.
    if (status.staged.length === 0) {
      return {
        success: false,
        code: 'NOTHING_STAGED',
        error: 'Nothing is staged. Stage the files you want to commit first.'
      };
    }

    const warnings = this.scanForSecrets(collectionPath, status.staged);

    if (warnings.length > 0) {
      const warningMessage = warnings
        .map((w) => `${w.file}: Potential ${w.type} detected`)
        .join('\n');

      return {
        success: false,
        code: 'SECRETS_DETECTED',
        error: `Potential secrets detected in staged files:\n${warningMessage}\n\nPlease use environment variables for sensitive data.`,
        warnings
      };
    }

    return this.withLock(collectionPath, async () => {
      const result = await git.commit(message);

      return {
        success: true,
        commit: result.commit,
        summary: result.summary
      };
    });
  }

  /**
   * Push the current branch to origin and set it as the upstream, so later status
   * calls can report ahead/behind.
   */
  async push(collectionPath) {
    const git = createGit(collectionPath);

    return this.withLock(collectionPath, async () => {
      try {
        const branch = await this.getCurrentBranch(collectionPath);
        const result = await git.push(DEFAULT_REMOTE, branch, ['--set-upstream']);
        return {
          success: true,
          pushed: result.pushed,
          remoteMessages: result.remoteMessages
        };
      } catch (error) {
        return this.describeError(error);
      }
    });
  }

  /**
   * Pull the current branch from origin, always as a merge (never a rebase) so it
   * doesn't depend on the user's `pull.rebase` setting.
   *
   * On conflict the merge is aborted, so the working tree is never left with conflict
   * markers in collection files. The caller then either picks a side per file
   * (resolveConflicts) or opens the merge in an editor (startManualMerge).
   */
  async pull(collectionPath) {
    const git = createGit(collectionPath);

    return this.withLock(collectionPath, async () => {
      const branch = await this.getCurrentBranch(collectionPath);
      try {
        const result = await git.pull(DEFAULT_REMOTE, branch, ['--no-rebase', '--no-edit']);
        return {
          success: true,
          summary: result.summary,
          files: result.files
        };
      } catch (error) {
        const conflicts = await this.abortMergeIfConflicted(git);

        if (conflicts.length > 0) {
          return {
            success: false,
            code: 'MERGE_CONFLICT',
            conflicts,
            conflictDetails: await this.getConflictDetails(git, branch, conflicts),
            error: `These files were changed both here and on the remote: ${conflicts.join(', ')}. The pull was cancelled and nothing was changed.`
          };
        }

        return this.describeError(error);
      }
    });
  }

  async abortMergeIfConflicted(git) {
    const status = await git.status();

    if (status.conflicted.length === 0) {
      return [];
    }

    await retryWhileIndexLocked(() => git.merge(['--abort']));
    return status.conflicted;
  }

  /**
   * The conflicting lines of each file, as { file, hunks: [{ ours, theirs }] }, so the
   * user can see what each choice keeps. Computed with `git merge-tree`, which merges
   * in memory and never touches the working tree (the real merge was already aborted).
   */
  async getConflictDetails(git, branch, files) {
    try {
      const output = await git.raw(['merge-tree', '--write-tree', '--name-only', 'HEAD', `${DEFAULT_REMOTE}/${branch}`]);
      const mergedTree = output.split(/\r\n|\r|\n/)[0].trim();

      const details = [];
      for (const file of files) {
        const content = await git.raw(['cat-file', '-p', `${mergedTree}:${file}`]);
        details.push({ file, hunks: parseConflictHunks(content) });
      }
      return details;
    } catch (error) {
      // Details are a convenience; the conflict itself is still reported without them.
      return files.map((file) => ({ file, hunks: [] }));
    }
  }

  /**
   * Start merging the already-fetched remote branch. Resolves either way: git exits
   * non-zero on conflicts, and the caller reads the outcome from status.
   */
  async mergeRemoteBranch(git) {
    const branch = (await git.status()).current;
    try {
      await retryWhileIndexLocked(() => git.merge(['--no-ff', '--no-edit', `${DEFAULT_REMOTE}/${branch}`]));
    } catch (error) {
      if (!(await this.isMergeInProgress(git))) {
        throw error;
      }
    }
    return (await git.status()).conflicted;
  }

  /**
   * Merge the remote branch, taking each conflicted file whole from the chosen side
   * ({ 'Posts.yml': 'ours' | 'theirs' }). Taking whole files keeps every request
   * internally consistent — mixing lines from both sides can pair one person's URL
   * with the other's params. Files without conflicts merge normally, so nobody's other
   * changes are lost. Any failure aborts the merge and leaves the working tree as it was.
   */
  async resolveConflicts(collectionPath, choices = {}) {
    const git = createGit(collectionPath);

    return this.withLock(collectionPath, async () => {
      try {
        const conflicted = await this.mergeRemoteBranch(git);

        const missing = conflicted.filter((file) => !CONFLICT_SIDES.includes(choices[file]));
        if (missing.length > 0) {
          await this.safeAbortMerge(git);
          return {
            success: false,
            code: 'CHOICE_MISSING',
            conflicts: conflicted,
            error: `Choose a version for every conflicting file: ${missing.join(', ')}`
          };
        }

        for (const file of conflicted) {
          await this.takeSide(git, file, choices[file]);
        }

        if (conflicted.length > 0 || (await this.isMergeInProgress(git))) {
          await retryWhileIndexLocked(() => git.raw(['commit', '--no-edit']));
        }

        return { success: true, resolved: conflicted };
      } catch (error) {
        await this.safeAbortMerge(git);
        return this.describeError(error);
      }
    });
  }

  /**
   * Resolve one conflicted file to one side. The file is removed only when the index
   * shows that side has no version of it (that side deleted it). Any other failure is
   * thrown so the caller aborts the whole merge; it must never turn into a deletion.
   */
  async takeSide(git, file, side) {
    const unmergedEntries = await git.raw(['ls-files', '--unmerged', '--', file]);
    const sideHasFile = unmergedEntries
      .split(/\r\n|\r|\n/)
      .some((entry) => entry.split(/\s+/)[2] === CONFLICT_STAGE[side]);

    if (!sideHasFile) {
      await retryWhileIndexLocked(() => git.raw(['rm', '--quiet', '--', file]));
      return;
    }

    await retryWhileIndexLocked(() => git.raw(['checkout', `--${side}`, '--', file]));
    await retryWhileIndexLocked(() => git.add(file));
  }

  // Abort a merge without letting a failed abort hide the original error.
  async safeAbortMerge(git) {
    try {
      if (await this.isMergeInProgress(git)) {
        await retryWhileIndexLocked(() => git.merge(['--abort']));
      }
    } catch (error) {
      console.error('Failed to abort merge:', error);
    }
  }

  /**
   * Start the merge and leave it in progress with conflict markers in the files, for
   * the user to resolve in their own editor. Auto-stage stays off until it is finished
   * or cancelled (see stageFile).
   */
  async startManualMerge(collectionPath) {
    const git = createGit(collectionPath);

    return this.withLock(collectionPath, async () => {
      try {
        const conflicts = await this.mergeRemoteBranch(git);
        return { success: true, conflicts, merged: conflicts.length === 0 };
      } catch (error) {
        return this.describeError(error);
      }
    });
  }

  /**
   * Conclude a merge resolved in an editor. Refuses while any merged file still has
   * conflict markers, since committing would publish a broken request file.
   */
  async finishMerge(collectionPath) {
    const git = createGit(collectionPath);

    return this.withLock(collectionPath, async () => {
      if (!(await this.isMergeInProgress(git))) {
        return { success: false, code: 'NO_MERGE', error: 'There is no merge in progress.' };
      }

      const status = await git.status();
      const touchedFiles = this.mergeTouchedFiles(status);
      const unresolved = this.filesWithConflictMarkers(collectionPath, touchedFiles);
      if (unresolved.length > 0) {
        return {
          success: false,
          code: 'UNRESOLVED_MARKERS',
          unresolved,
          error: `These files still contain conflict markers (<<<<<<< / >>>>>>>): ${unresolved.join(', ')}. Fix and save them, then finish the merge.`
        };
      }

      const invalid = await this.findInvalidFiles(collectionPath, touchedFiles);
      if (invalid.length > 0) {
        return {
          success: false,
          code: 'INVALID_FILES',
          invalid,
          error: `Bruno can't read these files after the merge: ${invalid.map(({ file, error }) => `${file} (${error})`).join('; ')}. Fix and save them, then finish the merge.`
        };
      }

      try {
        if (status.conflicted.length > 0) {
          await retryWhileIndexLocked(() => git.add(status.conflicted));
        }
        await retryWhileIndexLocked(() => git.raw(['commit', '--no-edit']));
        return { success: true };
      } catch (error) {
        return this.describeError(error);
      }
    });
  }

  async abortMerge(collectionPath) {
    const git = createGit(collectionPath);

    return this.withLock(collectionPath, async () => {
      try {
        await retryWhileIndexLocked(() => git.merge(['--abort']));
        return { success: true };
      } catch (error) {
        return this.describeError(error);
      }
    });
  }

  /**
   * Set remote URL
   */
  async setRemote(collectionPath, remoteName, remoteUrl) {
    const git = createGit(collectionPath);

    // Check if remote exists
    const remotes = await git.getRemotes();
    const remoteExists = remotes.some((r) => r.name === remoteName);

    if (remoteExists) {
      await git.remote(['set-url', remoteName, remoteUrl]);
    } else {
      await git.addRemote(remoteName, remoteUrl);
    }

    return { success: true };
  }

  /**
   * Get remote URL
   */
  async getRemote(collectionPath, remoteName) {
    const git = createGit(collectionPath);

    const remotes = await git.getRemotes(true);
    const remote = remotes.find((r) => r.name === remoteName);

    if (remote && remote.refs && remote.refs.fetch) {
      return remote.refs.fetch;
    }

    return null;
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(collectionPath) {
    const git = createGit(collectionPath);
    const status = await git.status();
    return status.current;
  }

  /**
   * Get commit history
   */
  async getHistory(collectionPath, limit = 50) {
    const git = createGit(collectionPath);
    const log = await git.log({ maxCount: limit });

    return log.all.map((commit) => ({
      hash: commit.hash,
      message: commit.message,
      author: commit.author_name,
      email: commit.author_email,
      date: commit.date
    }));
  }

  /**
   * Check if git is installed on system
   */
  async isGitInstalled() {
    try {
      const git = simpleGit();
      await git.version();
      return true;
    } catch (err) {
      return false;
    }
  }
}

module.exports = new GitService();
