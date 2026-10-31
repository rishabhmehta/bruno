const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { ipcMain, shell } = require('electron');
const gitService = require('../git/git-service');
const { gitConfigStore } = require('../store/git-config');

const VSCODE_MAC_BUNDLE_ID = 'com.microsoft.VSCode';

// Standard VS Code install locations on Windows: per-user installer first, then system-wide.
const windowsVsCodeExecutables = () => [
  process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Microsoft VS Code', 'Code.exe'),
  process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Microsoft VS Code', 'Code.exe'),
  process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Microsoft VS Code', 'Code.exe')
].filter(Boolean);

const runToCompletion = (command, args) => new Promise((resolve, reject) => {
  execFile(command, args, (error) => (error ? reject(error) : resolve()));
});

// Start an editor without waiting for it to exit (it stays open as long as the user works).
const startDetached = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.once('error', reject);
  child.once('spawn', () => {
    child.unref();
    resolve();
  });
});

/**
 * Launch VS Code once with the collection folder and the files. Opening the folder lets
 * VS Code's Source Control view list the conflicts and offer its merge editor.
 *
 * - Launching the app directly (not via vscode:// links) avoids VS Code's "an external
 *   application wants to open…" confirmation, which links trigger once per file.
 * - Never through a shell: file names come from the repository, and on Windows a name
 *   like `a&calc.yml` would run as a command if passed through cmd.exe.
 */
const launchVsCode = (root, absolutePaths) => {
  const args = [root, ...absolutePaths];

  if (process.platform === 'darwin') {
    return runToCompletion('open', ['-b', VSCODE_MAC_BUNDLE_ID, ...args]);
  }
  if (process.platform === 'win32') {
    const executable = windowsVsCodeExecutables().find((candidate) => fs.existsSync(candidate));
    if (!executable) {
      return Promise.reject(new Error('VS Code is not installed'));
    }
    return startDetached(executable, args);
  }
  return startDetached('code', args);
};

/**
 * Open conflicted files for manual resolution: VS Code when installed (its merge editor
 * understands conflict markers), otherwise the OS default app for each file. Paths come
 * from the renderer, so anything outside the collection folder is ignored.
 */
const openFilesInEditor = async (collectionPath, files) => {
  const root = path.resolve(collectionPath);
  const absolutePaths = files
    .map((file) => path.resolve(root, file))
    .filter((filePath) => filePath.startsWith(root + path.sep));

  if (absolutePaths.length === 0) {
    return { success: true, opened: 0 };
  }

  try {
    await launchVsCode(root, absolutePaths);
    return { success: true, opened: absolutePaths.length, editor: 'vscode' };
  } catch (error) {
    for (const filePath of absolutePaths) {
      await shell.openPath(filePath);
    }
    return { success: true, opened: absolutePaths.length, editor: 'default' };
  }
};

const registerGitSyncIpc = (mainWindow) => {
  // Initialize git repository
  ipcMain.handle('renderer:git-init', async (event, collectionPath, remoteUrl) => {
    try {
      const result = await gitService.initializeRepo(collectionPath);
      const config = {
        enabled: true,
        initialized: true,
        autoStage: true
      };

      if (remoteUrl) {
        await gitService.setRemote(collectionPath, 'origin', remoteUrl);
        config.remote = remoteUrl;
      }

      gitConfigStore.setGitConfig(collectionPath, config);

      return result;
    } catch (error) {
      return gitService.describeError(error);
    }
  });

  // Get git status
  ipcMain.handle('renderer:git-status', async (event, collectionPath) => {
    try {
      const isRepo = await gitService.isGitRepo(collectionPath);

      if (!isRepo) {
        return { success: false, error: 'Not a git repository' };
      }

      const status = await gitService.getStatus(collectionPath);
      return { success: true, status };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Stage all changes
  ipcMain.handle('renderer:git-stage-all', async (event, collectionPath) => {
    try {
      const result = await gitService.stageAll(collectionPath);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Unstage specific file
  ipcMain.handle('renderer:git-unstage-file', async (event, collectionPath, filePath) => {
    try {
      const result = await gitService.unstageFile(collectionPath, filePath);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Commit changes
  ipcMain.handle('renderer:git-commit', async (event, collectionPath, message) => {
    try {
      if (!message || message.trim().length === 0) {
        return { success: false, error: 'Commit message is required' };
      }

      const result = await gitService.commit(collectionPath, message);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Push current branch to origin
  ipcMain.handle('renderer:git-push', async (event, collectionPath) => {
    try {
      return await gitService.push(collectionPath);
    } catch (error) {
      return gitService.describeError(error);
    }
  });

  // Pull current branch from origin
  ipcMain.handle('renderer:git-pull', async (event, collectionPath) => {
    try {
      return await gitService.pull(collectionPath);
    } catch (error) {
      return gitService.describeError(error);
    }
  });

  // Merge the remote, taking each conflicted file whole from the chosen side
  ipcMain.handle('renderer:git-resolve-conflicts', async (event, collectionPath, choices) => {
    try {
      if (!choices || typeof choices !== 'object') {
        return { success: false, error: 'A version must be chosen for each conflicting file' };
      }
      return await gitService.resolveConflicts(collectionPath, choices);
    } catch (error) {
      return gitService.describeError(error);
    }
  });

  // Leave the merge in progress and open the conflicted files in an editor
  ipcMain.handle('renderer:git-start-manual-merge', async (event, collectionPath) => {
    try {
      const result = await gitService.startManualMerge(collectionPath);
      if (result.success && result.conflicts.length > 0) {
        await openFilesInEditor(collectionPath, result.conflicts);
      }
      return result;
    } catch (error) {
      return gitService.describeError(error);
    }
  });

  ipcMain.handle('renderer:git-open-in-editor', async (event, collectionPath, files) => {
    try {
      return await openFilesInEditor(collectionPath, Array.isArray(files) ? files : []);
    } catch (error) {
      return gitService.describeError(error);
    }
  });

  ipcMain.handle('renderer:git-finish-merge', async (event, collectionPath) => {
    try {
      return await gitService.finishMerge(collectionPath);
    } catch (error) {
      return gitService.describeError(error);
    }
  });

  ipcMain.handle('renderer:git-abort-merge', async (event, collectionPath) => {
    try {
      return await gitService.abortMerge(collectionPath);
    } catch (error) {
      return gitService.describeError(error);
    }
  });

  // Fetch from origin, then return fresh status (with ahead/behind)
  ipcMain.handle('renderer:git-fetch', async (event, collectionPath) => {
    try {
      const fetchResult = await gitService.fetchRemote(collectionPath);
      const status = await gitService.getStatus(collectionPath);
      return { success: true, status, fetched: fetchResult.fetched, fetchError: fetchResult.success ? null : fetchResult.error };
    } catch (error) {
      return gitService.describeError(error);
    }
  });

  // Set remote URL
  ipcMain.handle('renderer:git-set-remote', async (event, collectionPath, remoteName, remoteUrl) => {
    try {
      const result = await gitService.setRemote(collectionPath, remoteName, remoteUrl);

      // Save to config
      const config = gitConfigStore.getGitConfig(collectionPath) || {};
      config.remote = remoteUrl;
      gitConfigStore.setGitConfig(collectionPath, config);

      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Get commit history
  ipcMain.handle('renderer:git-history', async (event, collectionPath, limit) => {
    try {
      const history = await gitService.getHistory(collectionPath, limit);
      return { success: true, history };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Check if git is installed
  ipcMain.handle('renderer:git-check-installed', async () => {
    try {
      const installed = await gitService.isGitInstalled();
      return { success: true, installed };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Check if directory is a git repository
  ipcMain.handle('renderer:git-is-repo', async (event, collectionPath) => {
    try {
      const isRepo = await gitService.isGitRepo(collectionPath);
      return { success: true, isRepo };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Get remote URL
  ipcMain.handle('renderer:git-get-remote', async (event, collectionPath, remoteName) => {
    try {
      const url = await gitService.getRemote(collectionPath, remoteName);
      return { success: true, url };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Commit and push in one operation
  ipcMain.handle('renderer:git-commit-and-push', async (event, collectionPath, message) => {
    try {
      if (!message || message.trim().length === 0) {
        return { success: false, error: 'Commit message is required' };
      }

      const commitResult = await gitService.commit(collectionPath, message);

      if (!commitResult.success) {
        return commitResult;
      }

      const pushResult = await gitService.push(collectionPath);

      if (!pushResult.success) {
        return {
          ...pushResult,
          committed: true,
          error: `Your changes were committed, but not pushed. ${pushResult.error}`
        };
      }

      return {
        success: true,
        commit: commitResult,
        push: pushResult
      };
    } catch (error) {
      return gitService.describeError(error);
    }
  });
};

module.exports = registerGitSyncIpc;
