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
        state.collections[collectionUid].pendingChanges
          = (status.staged?.length || 0) + (status.modified?.length || 0);
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
