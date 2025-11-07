const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');

class GitService {
  /**
   * Check if directory is a git repository
   */
  async isGitRepo(collectionPath) {
    try {
      const git = simpleGit(collectionPath);
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
    const git = simpleGit(collectionPath);
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

  /**
   * Get current repository status
   */
  async getStatus(collectionPath) {
    const git = simpleGit(collectionPath);
    const status = await git.status();

    // Combine modified and untracked files, but exclude files that are already staged
    const stagedFiles = new Set(status.staged);
    const modifiedFiles = [...status.modified, ...status.not_added].filter((file) => !stagedFiles.has(file));

    return {
      branch: status.current,
      staged: status.staged,
      modified: modifiedFiles, // Only unstaged modified/untracked files
      created: status.created,
      deleted: status.deleted,
      renamed: status.renamed,
      ahead: status.ahead,
      behind: status.behind,
      isClean: status.isClean()
    };
  }

  /**
   * Stage all changes
   */
  async stageAll(collectionPath) {
    const git = simpleGit(collectionPath);
    await git.add('./*');
    return { success: true };
  }

  /**
   * Unstage specific file
   */
  async unstageFile(collectionPath, filePath) {
    const git = simpleGit(collectionPath);
    // If filePath is already relative (doesn't start with /), use it directly
    // Otherwise, convert absolute path to relative
    const relativePath = path.isAbsolute(filePath)
      ? path.relative(collectionPath, filePath)
      : filePath;
    await git.reset(['HEAD', relativePath]);
    return { success: true };
  }

  /**
   * Stage specific file
   */
  async stageFile(collectionPath, filePath) {
    const git = simpleGit(collectionPath);
    const relativePath = path.relative(collectionPath, filePath);
    await git.add(relativePath);
    return { success: true };
  }

  /**
   * Scan staged files for potential secrets
   */
  async scanForSecrets(collectionPath) {
    const git = simpleGit(collectionPath);
    const status = await git.status();

    const warnings = [];
    const secretPatterns = [
      { pattern: /x-api-key:\s*[a-zA-Z0-9_-]{10,}/i, type: 'X-API-Key header' },
      { pattern: /apikey:\s*[a-zA-Z0-Z0-9_-]{10,}/i, type: 'API Key' },
      { pattern: /authorization:\s*bearer\s+[a-zA-Z0-9_-]{10,}/i, type: 'Bearer token' },
      { pattern: /password:\s*[^\s]{5,}/i, type: 'Password' },
      { pattern: /secret[_-]?key:\s*[a-zA-Z0-9_-]{10,}/i, type: 'Secret key' },
      { pattern: /api[_-]?secret:\s*[a-zA-Z0-9_-]{10,}/i, type: 'API secret' }
    ];

    for (const file of status.staged) {
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
    // Scan for potential secrets before committing
    const warnings = await this.scanForSecrets(collectionPath);

    if (warnings.length > 0) {
      const warningMessage = warnings
        .map((w) => `${w.file}: Potential ${w.type} detected`)
        .join('\n');

      return {
        success: false,
        error: `Potential secrets detected in staged files:\n${warningMessage}\n\nPlease use environment variables for sensitive data.`,
        warnings
      };
    }

    const git = simpleGit(collectionPath);
    const result = await git.commit(message);

    return {
      success: true,
      commit: result.commit,
      summary: result.summary
    };
  }

  /**
   * Push to remote
   */
  async push(collectionPath, remote = 'origin', branch = 'main') {
    const git = simpleGit(collectionPath);
    const result = await git.push(remote, branch);

    return {
      success: true,
      pushed: result.pushed,
      remoteMessages: result.remoteMessages
    };
  }

  /**
   * Pull from remote
   */
  async pull(collectionPath, remote = 'origin', branch = 'main') {
    const git = simpleGit(collectionPath);
    const result = await git.pull(remote, branch);

    return {
      success: true,
      summary: result.summary,
      files: result.files,
      insertions: result.insertions,
      deletions: result.deletions
    };
  }

  /**
   * Set remote URL
   */
  async setRemote(collectionPath, remoteName, remoteUrl) {
    const git = simpleGit(collectionPath);

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
    const git = simpleGit(collectionPath);

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
    const git = simpleGit(collectionPath);
    const status = await git.status();
    return status.current;
  }

  /**
   * Get commit history
   */
  async getHistory(collectionPath, limit = 50) {
    const git = simpleGit(collectionPath);
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
