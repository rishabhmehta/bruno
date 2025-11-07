const { ipcMain } = require('electron');
const gitService = require('../git/git-service');
const { gitConfigStore } = require('../store/git-config');

const registerGitSyncIpc = (mainWindow) => {
  // Initialize git repository
  ipcMain.handle('renderer:git-init', async (event, collectionPath) => {
    try {
      const result = await gitService.initializeRepo(collectionPath);

      // Save config
      gitConfigStore.setGitConfig(collectionPath, {
        enabled: true,
        initialized: true,
        autoStage: true
      });

      return result;
    } catch (error) {
      return { success: false, error: error.message };
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

  // Push to remote
  ipcMain.handle('renderer:git-push', async (event, collectionPath, remote, branch) => {
    try {
      const result = await gitService.push(collectionPath, remote, branch);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Pull from remote
  ipcMain.handle('renderer:git-pull', async (event, collectionPath, remote, branch) => {
    try {
      const result = await gitService.pull(collectionPath, remote, branch);
      return result;
    } catch (error) {
      return { success: false, error: error.message };
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
  ipcMain.handle('renderer:git-commit-and-push', async (event, collectionPath, message, remote, branch) => {
    try {
      // First commit
      const commitResult = await gitService.commit(collectionPath, message);

      if (!commitResult.success) {
        return commitResult;
      }

      // Then push
      const pushResult = await gitService.push(collectionPath, remote, branch);

      return {
        success: true,
        commit: commitResult,
        push: pushResult
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
};

module.exports = registerGitSyncIpc;
