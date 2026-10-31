# Bruno Git Sync Feature - Implementation Plan

**Last Updated**: 2025-11-08
**Status**: Planning Complete - Ready for Implementation

---

## Table of Contents
1. [Overview](#overview)
2. [Requirements](#requirements)
3. [Architecture](#architecture)
4. [Phase-by-Phase Implementation](#phase-by-phase-implementation)
5. [File Structure](#file-structure)
6. [Implementation Checklist](#implementation-checklist)
7. [Technical Details](#technical-details)
8. [Testing Plan](#testing-plan)

---

## Overview

### Goal
Build a complete git sync feature for Bruno that allows users to version control their `.bru` collections with git, supporting initialization of new repos, auto-staging of changes, manual commits with messages, and push/pull synchronization.

### User Requirements (Confirmed)
- ✅ **Sync Mode**: Hybrid approach - Auto-stage changes, manual commit with custom messages
- ✅ **Features**: Commit & Push + Pull & Sync (no branch management or history viewer in v1)
- ✅ **Repository**: Initialize new repos from Bruno UI
- ✅ **Authentication**: Use system git config (whatever is already configured)

### Key Design Decisions
1. Collections are stored as directory-based structures with `.bru` files
2. Use `simple-git` npm package for git operations
3. Follow existing Bruno IPC patterns (Electron main ↔ renderer communication)
4. Auto-stage happens via collection file watcher
5. Manual commit triggered by user with custom message
6. Git state stored in Redux + bruno.json config

---

## Requirements

### Dependencies to Add
```json
// packages/bruno-electron/package.json
{
  "dependencies": {
    "simple-git": "^3.x.x"
  }
}
```

### System Requirements
- Git must be installed on user's system
- Git config should be set up (user.name, user.email)
- For remote operations: SSH keys or HTTPS credentials configured

---

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    User Edits .bru File                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│           Collection Watcher (chokidar)                      │
│  Detects file change → Checks if git enabled                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│           Git Service: Auto-stage changed files              │
│  simple-git: git add <changed-file>                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│           Send IPC Event to Renderer                         │
│  main:git-status-updated {pendingChanges: 3}                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│           Redux Store Updated                                │
│  Git slice: Update pending changes count                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│           UI Updated                                         │
│  CollectionToolBar: Show badge with "3 pending changes"     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│           User Clicks Git Icon → Opens Git Panel            │
│  - Sees staged files list                                   │
│  - Enters commit message                                    │
│  - Clicks "Commit & Push"                                   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│           IPC Call: renderer:git-commit-and-push            │
│  { collectionPath, message }                                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│           Git Service Executes                               │
│  1. git commit -m "message"                                 │
│  2. git push origin main                                    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│           Success/Error Returned to Renderer                 │
│  Toast notification: "Successfully pushed to remote"        │
└─────────────────────────────────────────────────────────────┘
```

### Component Architecture

```
packages/
├── bruno-electron/              # Backend (Electron Main Process)
│   ├── src/
│   │   ├── git/
│   │   │   └── git-service.js   # ⭐ NEW: Git operations wrapper
│   │   ├── ipc/
│   │   │   ├── collection.js    # MODIFY: Add git awareness
│   │   │   └── git-sync.js      # ⭐ NEW: Git IPC handlers
│   │   ├── store/
│   │   │   └── git-config.js    # ⭐ NEW: Persist git settings
│   │   └── app/
│   │       └── collection-watcher.js  # MODIFY: Add auto-stage
│   └── package.json             # MODIFY: Add simple-git
│
└── bruno-app/                   # Frontend (Electron Renderer)
    └── src/
        ├── providers/ReduxStore/slices/
        │   ├── git/
        │   │   ├── index.js     # ⭐ NEW: Git Redux slice
        │   │   └── actions.js   # ⭐ NEW: Git async actions
        │   └── collections/
        │       └── index.js     # MODIFY: Add git config to state
        └── components/
            ├── GitSync/
            │   ├── GitPanel/
            │   │   ├── index.js          # ⭐ NEW: Main git UI
            │   │   └── StyledWrapper.js  # ⭐ NEW: Styles
            │   ├── InitializeRepo/
            │   │   └── index.js          # ⭐ NEW: Git init modal
            │   ├── SyncStatus/
            │   │   └── index.js          # ⭐ NEW: Status indicator
            │   └── ConflictResolver/
            │       └── index.js          # ⭐ NEW: Handle conflicts
            ├── RequestTabs/CollectionToolBar/
            │   └── index.js     # MODIFY: Add git icon
            └── CollectionSettings/
                └── index.js     # MODIFY: Add git settings tab
```

---

## Phase-by-Phase Implementation

### Phase 1: Backend - Git Operations Layer
**Location**: `/packages/bruno-electron/src/git/`

#### 1.1 Create Git Service Module ⭐ NEW FILE
**File**: `packages/bruno-electron/src/git/git-service.js`

```javascript
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
node_modules/
.DS_Store
*.log
.env.local
*.secrets.bru
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

    return {
      branch: status.current,
      staged: status.staged,
      modified: status.modified,
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
   * Stage specific file
   */
  async stageFile(collectionPath, filePath) {
    const git = simpleGit(collectionPath);
    const relativePath = path.relative(collectionPath, filePath);
    await git.add(relativePath);
    return { success: true };
  }

  /**
   * Create commit
   */
  async commit(collectionPath, message) {
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
    const remoteExists = remotes.some(r => r.name === remoteName);

    if (remoteExists) {
      await git.remote(['set-url', remoteName, remoteUrl]);
    } else {
      await git.addRemote(remoteName, remoteUrl);
    }

    return { success: true };
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

    return log.all.map(commit => ({
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
```

#### 1.2 Create Git IPC Handlers ⭐ NEW FILE
**File**: `packages/bruno-electron/src/ipc/git-sync.js`

```javascript
const { ipcMain } = require('electron');
const gitService = require('../git/git-service');
const { gitConfigStore } = require('../store/git-config');

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
```

**Register IPC handlers in main process:**

Modify `packages/bruno-electron/src/ipc/index.js`:
```javascript
// Add this line
require('./git-sync');
```

#### 1.3 Create Git Config Store ⭐ NEW FILE
**File**: `packages/bruno-electron/src/store/git-config.js`

```javascript
const Store = require('electron-store');

class GitConfigStore {
  constructor() {
    this.store = new Store({
      name: 'git-config',
      clearInvalidConfig: true
    });
  }

  /**
   * Get git config for a collection
   */
  getGitConfig(collectionPath) {
    const configs = this.store.get('gitConfigs', {});
    return configs[collectionPath] || null;
  }

  /**
   * Set git config for a collection
   */
  setGitConfig(collectionPath, config) {
    const configs = this.store.get('gitConfigs', {});
    configs[collectionPath] = {
      ...configs[collectionPath],
      ...config,
      updatedAt: new Date().toISOString()
    };
    this.store.set('gitConfigs', configs);
  }

  /**
   * Remove git config for a collection
   */
  removeGitConfig(collectionPath) {
    const configs = this.store.get('gitConfigs', {});
    delete configs[collectionPath];
    this.store.set('gitConfigs', configs);
  }

  /**
   * Get all git configs
   */
  getAllGitConfigs() {
    return this.store.get('gitConfigs', {});
  }
}

module.exports = {
  gitConfigStore: new GitConfigStore()
};
```

#### 1.4 Integrate with Collection Watcher 🔧 MODIFY
**File**: `packages/bruno-electron/src/app/collection-watcher.js`

Find the `change` function and add auto-staging logic:

```javascript
// Around line 300-400 in change function
const change = async (win, pathname, collectionUid, collectionPath, useWorkerThread) => {
  // ... existing code ...

  // NEW: Auto-stage if git is enabled
  try {
    const { gitConfigStore } = require('../store/git-config');
    const gitService = require('../git/git-service');

    const gitConfig = gitConfigStore.getGitConfig(collectionPath);

    if (gitConfig && gitConfig.enabled && gitConfig.autoStage) {
      const isRepo = await gitService.isGitRepo(collectionPath);

      if (isRepo) {
        // Stage the changed file
        await gitService.stageFile(collectionPath, pathname);

        // Get updated status
        const status = await gitService.getStatus(collectionPath);

        // Send status to renderer
        win.webContents.send('main:git-status-updated', {
          collectionUid,
          collectionPath,
          pendingChanges: status.staged.length + status.modified.length,
          status
        });
      }
    }
  } catch (error) {
    console.error('Git auto-stage error:', error);
  }
};

// Similarly update add, unlink functions
```

---

### Phase 2: Frontend - Redux State Management
**Location**: `/packages/bruno-app/src/providers/ReduxStore/slices/git/`

#### 2.1 Create Git Redux Slice ⭐ NEW FILE
**File**: `packages/bruno-app/src/providers/ReduxStore/slices/git/index.js`

```javascript
import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  // Map of collectionUid to git state
  collections: {},

  // Global git availability
  gitInstalled: null,
  checkingGitInstalled: false
};

export const gitSlice = createSlice({
  name: 'git',
  initialState,
  reducers: {
    setGitInstalled: (state, action) => {
      state.gitInstalled = action.payload;
    },

    setCheckingGitInstalled: (state, action) => {
      state.checkingGitInstalled = action.payload;
    },

    initializeGitState: (state, action) => {
      const { collectionUid, collectionPath } = action.payload;

      state.collections[collectionUid] = {
        collectionPath,
        enabled: false,
        initialized: false,
        remote: null,
        branch: 'main',
        stagedFiles: [],
        modifiedFiles: [],
        pendingChanges: 0,
        lastSync: null,
        syncing: false,
        error: null,
        autoStage: true
      };
    },

    updateGitStatus: (state, action) => {
      const { collectionUid, status } = action.payload;

      if (state.collections[collectionUid]) {
        state.collections[collectionUid].branch = status.branch;
        state.collections[collectionUid].stagedFiles = status.staged || [];
        state.collections[collectionUid].modifiedFiles = status.modified || [];
        state.collections[collectionUid].pendingChanges =
          (status.staged?.length || 0) + (status.modified?.length || 0);
        state.collections[collectionUid].initialized = true;
      }
    },

    setGitEnabled: (state, action) => {
      const { collectionUid, enabled } = action.payload;

      if (state.collections[collectionUid]) {
        state.collections[collectionUid].enabled = enabled;
      }
    },

    setGitSyncing: (state, action) => {
      const { collectionUid, syncing } = action.payload;

      if (state.collections[collectionUid]) {
        state.collections[collectionUid].syncing = syncing;
      }
    },

    setGitError: (state, action) => {
      const { collectionUid, error } = action.payload;

      if (state.collections[collectionUid]) {
        state.collections[collectionUid].error = error;
        state.collections[collectionUid].syncing = false;
      }
    },

    setGitRemote: (state, action) => {
      const { collectionUid, remote } = action.payload;

      if (state.collections[collectionUid]) {
        state.collections[collectionUid].remote = remote;
      }
    },

    setLastSync: (state, action) => {
      const { collectionUid } = action.payload;

      if (state.collections[collectionUid]) {
        state.collections[collectionUid].lastSync = new Date().toISOString();
        state.collections[collectionUid].syncing = false;
        state.collections[collectionUid].error = null;
      }
    },

    clearGitState: (state, action) => {
      const { collectionUid } = action.payload;
      delete state.collections[collectionUid];
    }
  }
});

export const {
  setGitInstalled,
  setCheckingGitInstalled,
  initializeGitState,
  updateGitStatus,
  setGitEnabled,
  setGitSyncing,
  setGitError,
  setGitRemote,
  setLastSync,
  clearGitState
} = gitSlice.actions;

export default gitSlice.reducer;
```

#### 2.2 Create Git Actions ⭐ NEW FILE
**File**: `packages/bruno-app/src/providers/ReduxStore/slices/git/actions.js`

```javascript
import toast from 'react-hot-toast';
import {
  setGitInstalled,
  setCheckingGitInstalled,
  updateGitStatus,
  setGitEnabled,
  setGitSyncing,
  setGitError,
  setGitRemote,
  setLastSync,
  initializeGitState
} from './index';

// Check if git is installed
export const checkGitInstalled = () => (dispatch) => {
  dispatch(setCheckingGitInstalled(true));

  window.ipcRenderer
    .invoke('renderer:git-check-installed')
    .then((response) => {
      if (response.success) {
        dispatch(setGitInstalled(response.installed));
      } else {
        dispatch(setGitInstalled(false));
      }
    })
    .catch((error) => {
      console.error('Error checking git installation:', error);
      dispatch(setGitInstalled(false));
    })
    .finally(() => {
      dispatch(setCheckingGitInstalled(false));
    });
};

// Initialize git repository
export const initializeGitRepo = (collectionUid, collectionPath) => (dispatch) => {
  dispatch(setGitSyncing({ collectionUid, syncing: true }));

  return window.ipcRenderer
    .invoke('renderer:git-init', collectionPath)
    .then((response) => {
      if (response.success) {
        dispatch(setGitEnabled({ collectionUid, enabled: true }));
        toast.success('Git repository initialized successfully');

        // Fetch initial status
        return dispatch(fetchGitStatus(collectionUid, collectionPath));
      } else {
        dispatch(setGitError({ collectionUid, error: response.error }));
        toast.error(`Failed to initialize git: ${response.error}`);
        throw new Error(response.error);
      }
    })
    .catch((error) => {
      dispatch(setGitError({ collectionUid, error: error.message }));
      toast.error(`Error initializing git: ${error.message}`);
      throw error;
    });
};

// Fetch git status
export const fetchGitStatus = (collectionUid, collectionPath) => (dispatch) => {
  return window.ipcRenderer
    .invoke('renderer:git-status', collectionPath)
    .then((response) => {
      if (response.success) {
        dispatch(updateGitStatus({ collectionUid, status: response.status }));
      } else {
        console.warn('Failed to fetch git status:', response.error);
      }
      return response;
    })
    .catch((error) => {
      console.error('Error fetching git status:', error);
      throw error;
    });
};

// Commit changes
export const commitChanges = (collectionUid, collectionPath, message) => (dispatch) => {
  dispatch(setGitSyncing({ collectionUid, syncing: true }));

  return window.ipcRenderer
    .invoke('renderer:git-commit', collectionPath, message)
    .then((response) => {
      if (response.success) {
        toast.success('Changes committed successfully');

        // Refresh status
        return dispatch(fetchGitStatus(collectionUid, collectionPath));
      } else {
        dispatch(setGitError({ collectionUid, error: response.error }));
        toast.error(`Commit failed: ${response.error}`);
        throw new Error(response.error);
      }
    })
    .catch((error) => {
      dispatch(setGitError({ collectionUid, error: error.message }));
      toast.error(`Error committing changes: ${error.message}`);
      throw error;
    })
    .finally(() => {
      dispatch(setGitSyncing({ collectionUid, syncing: false }));
    });
};

// Push to remote
export const pushToRemote = (collectionUid, collectionPath, remote = 'origin', branch = 'main') => (dispatch) => {
  dispatch(setGitSyncing({ collectionUid, syncing: true }));

  return window.ipcRenderer
    .invoke('renderer:git-push', collectionPath, remote, branch)
    .then((response) => {
      if (response.success) {
        dispatch(setLastSync({ collectionUid }));
        toast.success('Successfully pushed to remote');

        // Refresh status
        return dispatch(fetchGitStatus(collectionUid, collectionPath));
      } else {
        dispatch(setGitError({ collectionUid, error: response.error }));
        toast.error(`Push failed: ${response.error}`);
        throw new Error(response.error);
      }
    })
    .catch((error) => {
      dispatch(setGitError({ collectionUid, error: error.message }));
      toast.error(`Error pushing to remote: ${error.message}`);
      throw error;
    });
};

// Pull from remote
export const pullFromRemote = (collectionUid, collectionPath, remote = 'origin', branch = 'main') => (dispatch) => {
  dispatch(setGitSyncing({ collectionUid, syncing: true }));

  return window.ipcRenderer
    .invoke('renderer:git-pull', collectionPath, remote, branch)
    .then((response) => {
      if (response.success) {
        dispatch(setLastSync({ collectionUid }));
        toast.success(`Pulled changes: +${response.summary.insertions} -${response.summary.deletions}`);

        // Refresh status
        return dispatch(fetchGitStatus(collectionUid, collectionPath));
      } else {
        dispatch(setGitError({ collectionUid, error: response.error }));
        toast.error(`Pull failed: ${response.error}`);
        throw new Error(response.error);
      }
    })
    .catch((error) => {
      dispatch(setGitError({ collectionUid, error: error.message }));
      toast.error(`Error pulling from remote: ${error.message}`);
      throw error;
    });
};

// Commit and push in one action
export const commitAndPush = (collectionUid, collectionPath, message, remote = 'origin', branch = 'main') => (dispatch) => {
  dispatch(setGitSyncing({ collectionUid, syncing: true }));

  return window.ipcRenderer
    .invoke('renderer:git-commit-and-push', collectionPath, message, remote, branch)
    .then((response) => {
      if (response.success) {
        dispatch(setLastSync({ collectionUid }));
        toast.success('Successfully committed and pushed changes');

        // Refresh status
        return dispatch(fetchGitStatus(collectionUid, collectionPath));
      } else {
        dispatch(setGitError({ collectionUid, error: response.error }));
        toast.error(`Commit and push failed: ${response.error}`);
        throw new Error(response.error);
      }
    })
    .catch((error) => {
      dispatch(setGitError({ collectionUid, error: error.message }));
      toast.error(`Error: ${error.message}`);
      throw error;
    });
};

// Set remote URL
export const setRemoteUrl = (collectionUid, collectionPath, remoteName, remoteUrl) => (dispatch) => {
  return window.ipcRenderer
    .invoke('renderer:git-set-remote', collectionPath, remoteName, remoteUrl)
    .then((response) => {
      if (response.success) {
        dispatch(setGitRemote({ collectionUid, remote: remoteUrl }));
        toast.success('Remote URL updated successfully');
      } else {
        toast.error(`Failed to set remote: ${response.error}`);
        throw new Error(response.error);
      }
      return response;
    })
    .catch((error) => {
      toast.error(`Error setting remote URL: ${error.message}`);
      throw error;
    });
};
```

#### 2.3 Register Git Reducer 🔧 MODIFY
**File**: `packages/bruno-app/src/providers/ReduxStore/index.js`

```javascript
// Add import
import gitReducer from './slices/git';

// Add to reducers
const reducer = combineReducers({
  // ... existing reducers
  git: gitReducer
});
```

#### 2.4 Setup IPC Listener for Auto-Stage Events ⭐ NEW
**File**: `packages/bruno-app/src/providers/App/useGitSync.js`

```javascript
import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { updateGitStatus } from 'providers/ReduxStore/slices/git';

const useGitSync = () => {
  const dispatch = useDispatch();

  useEffect(() => {
    const handleGitStatusUpdate = (event, data) => {
      const { collectionUid, status } = data;
      dispatch(updateGitStatus({ collectionUid, status }));
    };

    // Listen for git status updates from main process
    window.ipcRenderer.on('main:git-status-updated', handleGitStatusUpdate);

    return () => {
      window.ipcRenderer.off('main:git-status-updated', handleGitStatusUpdate);
    };
  }, [dispatch]);
};

export default useGitSync;
```

**Register in App component:**

Modify `packages/bruno-app/src/providers/App/index.js`:
```javascript
import useGitSync from './useGitSync';

// Inside App component
useGitSync();
```

---

### Phase 3: UI Components
**Location**: `/packages/bruno-app/src/components/`

#### 3.1 Git Sync Button in CollectionToolBar 🔧 MODIFY
**File**: `packages/bruno-app/src/components/RequestTabs/CollectionToolBar/index.js`

```javascript
// Add imports
import { IconGitBranch } from '@tabler/icons';
import { useSelector } from 'react-redux';
import { useState } from 'react';
import GitPanel from 'components/GitSync/GitPanel';

const CollectionToolBar = ({ collection }) => {
  // ... existing code

  // Add state
  const [showGitPanel, setShowGitPanel] = useState(false);

  // Get git state from Redux
  const gitState = useSelector((state) => state.git.collections[collection.uid]);
  const pendingChanges = gitState?.pendingChanges || 0;

  return (
    <StyledWrapper>
      <div className="flex items-center p-2">
        {/* ... existing left side ... */}

        <div className="flex flex-3 items-center justify-end">
          <span className="mr-2">
            <JsSandboxMode collection={collection} />
          </span>

          {/* NEW: Git Sync Icon */}
          {gitState && gitState.enabled && (
            <span className="mr-3 relative">
              <ToolHint text="Git Sync" toolhintId="GitSyncToolhintId" place='bottom'>
                <div className="cursor-pointer relative" onClick={() => setShowGitPanel(!showGitPanel)}>
                  <IconGitBranch size={18} strokeWidth={1.5} />
                  {pendingChanges > 0 && (
                    <span className="absolute -top-1 -right-1 bg-yellow-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                      {pendingChanges}
                    </span>
                  )}
                </div>
              </ToolHint>
            </span>
          )}

          {/* ... existing icons ... */}
        </div>
      </div>

      {/* Git Panel Modal/Drawer */}
      {showGitPanel && (
        <GitPanel
          collection={collection}
          onClose={() => setShowGitPanel(false)}
        />
      )}
    </StyledWrapper>
  );
};
```

#### 3.2 Git Panel Component ⭐ NEW FILE
**File**: `packages/bruno-app/src/components/GitSync/GitPanel/index.js`

```javascript
import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { IconX, IconGitCommit, IconUpload, IconDownload } from '@tabler/icons';
import Modal from 'components/Modal';
import toast from 'react-hot-toast';
import {
  fetchGitStatus,
  commitAndPush,
  pullFromRemote
} from 'providers/ReduxStore/slices/git/actions';
import StyledWrapper from './StyledWrapper';

const GitPanel = ({ collection, onClose }) => {
  const dispatch = useDispatch();
  const gitState = useSelector((state) => state.git.collections[collection.uid]);

  const [commitMessage, setCommitMessage] = useState('');

  useEffect(() => {
    // Fetch latest status when panel opens
    dispatch(fetchGitStatus(collection.uid, collection.pathname));
  }, []);

  const handleCommitAndPush = () => {
    if (!commitMessage.trim()) {
      toast.error('Please enter a commit message');
      return;
    }

    const remote = gitState.remote || 'origin';
    const branch = gitState.branch || 'main';

    dispatch(commitAndPush(collection.uid, collection.pathname, commitMessage, remote, branch))
      .then(() => {
        setCommitMessage('');
      })
      .catch((error) => {
        console.error('Commit and push failed:', error);
      });
  };

  const handlePull = () => {
    const remote = gitState.remote || 'origin';
    const branch = gitState.branch || 'main';

    dispatch(pullFromRemote(collection.uid, collection.pathname, remote, branch))
      .catch((error) => {
        console.error('Pull failed:', error);
      });
  };

  if (!gitState) {
    return null;
  }

  return (
    <Modal size="md" title="Git Sync" handleCancel={onClose}>
      <StyledWrapper>
        <div className="git-panel">
          {/* Header */}
          <div className="panel-header">
            <div className="branch-info">
              <span className="branch-label">Branch:</span>
              <span className="branch-name">{gitState.branch}</span>
            </div>
            {gitState.lastSync && (
              <div className="last-sync">
                Last synced: {new Date(gitState.lastSync).toLocaleString()}
              </div>
            )}
          </div>

          {/* Staged Files */}
          <div className="files-section">
            <h3>Staged Changes ({gitState.stagedFiles.length})</h3>
            {gitState.stagedFiles.length > 0 ? (
              <ul className="file-list">
                {gitState.stagedFiles.map((file, index) => (
                  <li key={index} className="file-item">
                    <span className="file-status staged">A</span>
                    <span className="file-path">{file}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="no-changes">No staged changes</p>
            )}
          </div>

          {/* Modified Files */}
          {gitState.modifiedFiles.length > 0 && (
            <div className="files-section">
              <h3>Modified Files ({gitState.modifiedFiles.length})</h3>
              <ul className="file-list">
                {gitState.modifiedFiles.map((file, index) => (
                  <li key={index} className="file-item">
                    <span className="file-status modified">M</span>
                    <span className="file-path">{file}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Commit Message */}
          {gitState.pendingChanges > 0 && (
            <div className="commit-section">
              <label htmlFor="commit-message">Commit Message</label>
              <textarea
                id="commit-message"
                className="commit-input"
                placeholder="Enter commit message..."
                value={commitMessage}
                onChange={(e) => setCommitMessage(e.target.value)}
                rows={3}
                disabled={gitState.syncing}
              />
            </div>
          )}

          {/* Actions */}
          <div className="actions">
            <button
              className="btn btn-pull"
              onClick={handlePull}
              disabled={gitState.syncing}
            >
              <IconDownload size={16} />
              <span>Pull</span>
            </button>

            {gitState.pendingChanges > 0 && (
              <button
                className="btn btn-commit-push"
                onClick={handleCommitAndPush}
                disabled={gitState.syncing || !commitMessage.trim()}
              >
                <IconUpload size={16} />
                <span>{gitState.syncing ? 'Syncing...' : 'Commit & Push'}</span>
              </button>
            )}
          </div>

          {/* Error Display */}
          {gitState.error && (
            <div className="error-message">
              <strong>Error:</strong> {gitState.error}
            </div>
          )}
        </div>
      </StyledWrapper>
    </Modal>
  );
};

export default GitPanel;
```

#### 3.3 Git Panel Styles ⭐ NEW FILE
**File**: `packages/bruno-app/src/components/GitSync/GitPanel/StyledWrapper.js`

```javascript
import styled from 'styled-components';

const StyledWrapper = styled.div`
  .git-panel {
    padding: 1rem;
  }

  .panel-header {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid ${(props) => props.theme.colors.border};
  }

  .branch-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.95rem;
  }

  .branch-label {
    font-weight: 600;
    color: ${(props) => props.theme.colors.text.muted};
  }

  .branch-name {
    font-family: monospace;
    background: ${(props) => props.theme.colors.background.secondary};
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
  }

  .last-sync {
    margin-top: 0.5rem;
    font-size: 0.85rem;
    color: ${(props) => props.theme.colors.text.muted};
  }

  .files-section {
    margin-bottom: 1.5rem;

    h3 {
      font-size: 0.9rem;
      font-weight: 600;
      margin-bottom: 0.75rem;
      color: ${(props) => props.theme.colors.text.default};
    }
  }

  .file-list {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 200px;
    overflow-y: auto;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: 4px;
    font-size: 0.85rem;
    font-family: monospace;

    &:hover {
      background: ${(props) => props.theme.colors.background.secondary};
    }
  }

  .file-status {
    width: 20px;
    height: 20px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 600;

    &.staged {
      background: #22c55e;
      color: white;
    }

    &.modified {
      background: #f59e0b;
      color: white;
    }
  }

  .file-path {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .no-changes {
    color: ${(props) => props.theme.colors.text.muted};
    font-size: 0.85rem;
    font-style: italic;
  }

  .commit-section {
    margin-bottom: 1.5rem;

    label {
      display: block;
      font-size: 0.9rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }
  }

  .commit-input {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid ${(props) => props.theme.colors.border};
    border-radius: 4px;
    font-size: 0.9rem;
    font-family: inherit;
    resize: vertical;
    background: ${(props) => props.theme.colors.background.default};
    color: ${(props) => props.theme.colors.text.default};

    &:focus {
      outline: none;
      border-color: ${(props) => props.theme.colors.primary};
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  .btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.25rem;
    border: none;
    border-radius: 4px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  .btn-pull {
    background: ${(props) => props.theme.colors.background.secondary};
    color: ${(props) => props.theme.colors.text.default};

    &:hover:not(:disabled) {
      background: ${(props) => props.theme.colors.background.tertiary};
    }
  }

  .btn-commit-push {
    background: ${(props) => props.theme.colors.primary};
    color: white;

    &:hover:not(:disabled) {
      opacity: 0.9;
    }
  }

  .error-message {
    padding: 1rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 4px;
    color: #dc2626;
    font-size: 0.85rem;
    margin-top: 1rem;

    strong {
      font-weight: 600;
    }
  }
`;

export default StyledWrapper;
```

#### 3.4 Initialize Git Repository Modal ⭐ NEW FILE
**File**: `packages/bruno-app/src/components/GitSync/InitializeRepo/index.js`

```javascript
import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import Modal from 'components/Modal';
import { initializeGitRepo, setRemoteUrl } from 'providers/ReduxStore/slices/git/actions';
import toast from 'react-hot-toast';

const InitializeRepo = ({ collection, onClose, onSuccess }) => {
  const dispatch = useDispatch();
  const [remoteUrl, setRemoteUrlValue] = useState('');
  const [initializing, setInitializing] = useState(false);

  const handleInitialize = () => {
    setInitializing(true);

    dispatch(initializeGitRepo(collection.uid, collection.pathname))
      .then(() => {
        // If remote URL provided, set it
        if (remoteUrl.trim()) {
          return dispatch(setRemoteUrl(collection.uid, collection.pathname, 'origin', remoteUrl.trim()));
        }
      })
      .then(() => {
        toast.success('Git repository initialized successfully!');
        if (onSuccess) {
          onSuccess();
        }
        onClose();
      })
      .catch((error) => {
        console.error('Failed to initialize git:', error);
      })
      .finally(() => {
        setInitializing(false);
      });
  };

  return (
    <Modal size="md" title="Initialize Git Repository" handleCancel={onClose}>
      <div className="p-4">
        <p className="mb-4">
          Initialize a git repository for this collection to enable version control and syncing.
        </p>

        <div className="mb-4">
          <label className="block mb-2 font-semibold">
            Remote Repository URL (Optional)
          </label>
          <input
            type="text"
            className="w-full p-2 border rounded"
            placeholder="https://github.com/username/repo.git"
            value={remoteUrl}
            onChange={(e) => setRemoteUrlValue(e.target.value)}
            disabled={initializing}
          />
          <p className="text-sm text-gray-500 mt-1">
            You can add this later in collection settings
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <button
            className="px-4 py-2 border rounded"
            onClick={onClose}
            disabled={initializing}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded"
            onClick={handleInitialize}
            disabled={initializing}
          >
            {initializing ? 'Initializing...' : 'Initialize'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default InitializeRepo;
```

#### 3.5 Git Settings in Collection Settings 🔧 MODIFY
**File**: `packages/bruno-app/src/components/CollectionSettings/index.js`

Add a new tab for Git settings:

```javascript
// Add imports
import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { initializeGitRepo, setRemoteUrl } from 'providers/ReduxStore/slices/git/actions';
import { setGitEnabled } from 'providers/ReduxStore/slices/git';
import InitializeRepo from 'components/GitSync/InitializeRepo';

const CollectionSettings = ({ collection }) => {
  // ... existing code

  // Add git tab
  const tabs = [
    'Settings',
    'Docs',
    'Headers',
    'Auth',
    'Script',
    'Tests',
    'Vars',
    'Assertions',
    'Proxy',
    'Git Sync'  // NEW TAB
  ];

  const gitState = useSelector((state) => state.git.collections[collection.uid]);
  const [showInitModal, setShowInitModal] = useState(false);

  // Render git settings tab
  const renderGitSettings = () => {
    if (!gitState || !gitState.initialized) {
      return (
        <div className="p-4">
          <h3 className="font-semibold mb-2">Git Sync</h3>
          <p className="mb-4">Initialize a git repository to enable version control.</p>
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded"
            onClick={() => setShowInitModal(true)}
          >
            Initialize Git Repository
          </button>

          {showInitModal && (
            <InitializeRepo
              collection={collection}
              onClose={() => setShowInitModal(false)}
              onSuccess={() => {
                // Refresh git state
              }}
            />
          )}
        </div>
      );
    }

    return (
      <div className="p-4">
        <h3 className="font-semibold mb-4">Git Sync Settings</h3>

        <div className="mb-4">
          <label className="block mb-2">Remote URL</label>
          <input
            type="text"
            className="w-full p-2 border rounded"
            value={gitState.remote || ''}
            onChange={(e) => {
              // Update remote URL
              dispatch(setRemoteUrl(collection.uid, collection.pathname, 'origin', e.target.value));
            }}
          />
        </div>

        <div className="mb-4">
          <label className="block mb-2">Current Branch</label>
          <input
            type="text"
            className="w-full p-2 border rounded bg-gray-100"
            value={gitState.branch || 'main'}
            disabled
          />
        </div>

        <div className="mb-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={gitState.enabled}
              onChange={(e) => {
                dispatch(setGitEnabled({ collectionUid: collection.uid, enabled: e.target.checked }));
              }}
            />
            <span>Enable Git Sync</span>
          </label>
        </div>
      </div>
    );
  };

  // Update tab rendering
  return (
    <StyledWrapper>
      {/* ... existing tabs ... */}
      {activeTab === 'Git Sync' && renderGitSettings()}
    </StyledWrapper>
  );
};
```

---

### Phase 4: bruno.json Schema Update

#### 4.1 Update bruno.json to include git config

When a collection is created or git is initialized, update `bruno.json`:

```json
{
  "version": "1",
  "name": "my-collection",
  "type": "collection",
  "git": {
    "enabled": true,
    "autoStage": true,
    "remote": "https://github.com/user/repo.git",
    "branch": "main"
  }
}
```

This should be handled in:
- `packages/bruno-electron/src/ipc/git-sync.js` - Write git config to bruno.json
- `packages/bruno-electron/src/ipc/collection.js` - Read git config when loading collections

---

### Phase 5: Error Handling

#### 5.1 Common Error Scenarios

1. **Git not installed**
   - Check on app startup
   - Show warning in UI
   - Disable git features

2. **No remote configured**
   - Warn before push/pull
   - Prompt to set remote URL

3. **Merge conflicts**
   - Detect during pull
   - Show conflict files
   - Provide options to resolve

4. **Authentication failures**
   - Show clear error message
   - Link to git config documentation

5. **Network errors**
   - Retry mechanism
   - Clear error messages

#### 5.2 Conflict Resolver Component ⭐ NEW FILE
**File**: `packages/bruno-app/src/components/GitSync/ConflictResolver/index.js`

```javascript
import React from 'react';
import Modal from 'components/Modal';

const ConflictResolver = ({ conflicts, onResolve, onClose }) => {
  return (
    <Modal size="lg" title="Merge Conflicts Detected" handleCancel={onClose}>
      <div className="p-4">
        <p className="mb-4">
          The following files have conflicts. Please resolve them manually:
        </p>

        <ul className="list-disc pl-5 mb-4">
          {conflicts.map((file, index) => (
            <li key={index} className="font-mono text-sm">
              {file}
            </li>
          ))}
        </ul>

        <p className="mb-4">
          Open your collection directory in a text editor to resolve conflicts manually,
          then commit the resolved changes.
        </p>

        <div className="flex justify-end">
          <button
            className="px-4 py-2 bg-blue-500 text-white rounded"
            onClick={onClose}
          >
            OK
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default ConflictResolver;
```

---

## Implementation Checklist

### Phase 1: Backend ✓
- [ ] Install `simple-git` dependency in bruno-electron
- [ ] Create `git-service.js` with all git operations
- [ ] Create `git-sync.js` IPC handlers
- [ ] Create `git-config.js` store
- [ ] Modify `collection-watcher.js` to auto-stage files
- [ ] Register IPC handlers in main process

### Phase 2: Redux ✓
- [ ] Create git Redux slice
- [ ] Create git actions (thunks)
- [ ] Register git reducer
- [ ] Create `useGitSync` hook for IPC events
- [ ] Register hook in App component

### Phase 3: UI Components ✓
- [ ] Modify CollectionToolBar to add git icon
- [ ] Create GitPanel component
- [ ] Create GitPanel styles
- [ ] Create InitializeRepo modal
- [ ] Modify CollectionSettings to add git tab
- [ ] Create ConflictResolver component

### Phase 4: Integration ✓
- [ ] Update bruno.json schema
- [ ] Load git config when loading collections
- [ ] Save git config when initializing
- [ ] Test end-to-end flow

### Phase 5: Testing ✓
- [ ] Test with new collection
- [ ] Test with existing git repo
- [ ] Test auto-stage on file changes
- [ ] Test commit and push
- [ ] Test pull from remote
- [ ] Test conflict scenarios
- [ ] Test error handling
- [ ] Test with multiple collections

---

## Technical Details

### Collection File Structure
```
my-collection/
├── .git/                  # Git directory (after init)
├── .gitignore            # Created during git init
├── bruno.json            # Collection config (includes git settings)
├── collection.bru        # Collection-level settings
├── environments/
│   ├── Production.bru
│   └── Development.bru
└── requests/
    ├── get-users.bru
    └── create-user.bru
```

### Git Workflow
1. User edits .bru file in VS Code or Bruno UI
2. Collection watcher detects change
3. Git service auto-stages the file
4. IPC event sent to renderer with updated status
5. Redux state updated
6. UI shows pending changes badge
7. User opens git panel
8. User enters commit message
9. User clicks "Commit & Push"
10. IPC call to backend
11. Git service commits and pushes
12. Success notification shown

### IPC Communication Flow
```
Renderer Process          Main Process
─────────────────         ──────────────
GitPanel                  git-sync.js
    │                         │
    ├──invoke────────────────>│
    │  'renderer:git-commit'  │
    │                         │
    │                     git-service.js
    │                         │
    │                    git.commit()
    │                         │
    │<──────return────────────┤
    │   {success: true}        │
    │                         │
Redux Action
updateGitStatus()
```

---

## Testing Plan

### Unit Tests
- [ ] Test git-service.js functions
- [ ] Test Redux actions
- [ ] Test Redux reducers

### Integration Tests
- [ ] Test IPC handlers
- [ ] Test file watcher integration
- [ ] Test collection loading with git config

### E2E Tests
- [ ] Test complete git init flow
- [ ] Test commit and push flow
- [ ] Test pull flow
- [ ] Test conflict resolution flow

### Manual Testing Scenarios
1. **New Collection**
   - Create collection
   - Initialize git
   - Make changes
   - Commit and push

2. **Existing Git Repo**
   - Open collection in existing repo
   - Verify auto-stage works
   - Test commit and push

3. **Multiple Collections**
   - Open multiple collections with git
   - Verify each has independent state
   - Test switching between collections

4. **Error Scenarios**
   - Test with git not installed
   - Test with no remote configured
   - Test with network errors
   - Test with merge conflicts

---

## Next Steps

1. **Start with Phase 1** - Build backend git service
2. **Test backend** - Use Electron DevTools console to test IPC
3. **Move to Phase 2** - Build Redux state management
4. **Build UI incrementally** - Start with basic git panel
5. **Test each component** - Ensure each piece works before moving on
6. **Integrate everything** - Wire up all components
7. **Polish UX** - Add animations, better error messages, etc.

---

## Notes & Tips

- Use `simple-git` documentation: https://github.com/steveukx/git-js
- Test with a dummy repository first
- Use git credentials configured in system (SSH keys or HTTPS tokens)
- Consider adding a "dry run" mode for testing
- Add telemetry to track git feature usage
- Consider adding git history viewer in future versions
- Consider adding branch switching in future versions

---

**Last Updated**: 2025-11-08
**Status**: Planning Complete - Ready to Start Implementation
