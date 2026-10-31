import toast from 'react-hot-toast';
import {
  setGitInstalled,
  setCheckingGitInstalled,
  updateGitStatus,
  setGitEnabled,
  setGitSyncing,
  setGitError,
  setGitRemote,
  setLastSync
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

// Fetch git status
export const fetchGitStatus = (collectionUid, collectionPath) => (dispatch) => {
  return window.ipcRenderer
    .invoke('renderer:git-status', collectionPath)
    .then((response) => {
      if (response.success) {
        dispatch(updateGitStatus({ collectionUid, status: response.status }));

        // Also fetch remote URL if it exists
        return window.ipcRenderer
          .invoke('renderer:git-get-remote', collectionPath, 'origin')
          .then((remoteResponse) => {
            if (remoteResponse.success && remoteResponse.url) {
              dispatch(setGitRemote({ collectionUid, remote: remoteResponse.url }));
            }
            return response;
          })
          .catch(() => {
            // Remote might not exist, that's okay
            return response;
          });
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

/**
 * Runs one git operation over IPC with the shared lifecycle: mark the collection as
 * syncing, show exactly one toast (success or failure), keep the error and any
 * conflicted files in state for the panel, and always refresh status afterwards —
 * a failed push can still have created a commit.
 *
 * Rejects with the error so callers can react, but callers must not toast again.
 */
const runGitAction = ({ dispatch, collectionUid, collectionPath, invoke, successMessage }) => {
  dispatch(setGitError({ collectionUid, error: null }));
  dispatch(setGitSyncing({ collectionUid, syncing: true }));

  return invoke()
    .then((response) => {
      if (!response.success) {
        const error = new Error(response.error);
        error.conflicts = response.conflicts;
        error.conflictDetails = response.conflictDetails;
        throw error;
      }

      const message = typeof successMessage === 'function' ? successMessage(response) : successMessage;
      if (message) {
        toast.success(message);
      }
      return response;
    })
    .catch((error) => {
      dispatch(setGitError({
        collectionUid,
        error: error.message,
        conflicts: error.conflicts,
        conflictDetails: error.conflictDetails
      }));
      toast.error(error.conflictDetails?.length ? 'Pull cancelled: conflicting changes' : error.message);
      throw error;
    })
    .finally(() => {
      dispatch(setGitSyncing({ collectionUid, syncing: false }));
      dispatch(fetchGitStatus(collectionUid, collectionPath)).catch(() => {});
    });
};

// Initialize git repository, optionally connecting it to a remote in the same step
export const initializeGitRepo = (collectionUid, collectionPath, remoteUrl) => (dispatch) => {
  return runGitAction({
    dispatch,
    collectionUid,
    collectionPath,
    invoke: () => window.ipcRenderer.invoke('renderer:git-init', collectionPath, remoteUrl || null),
    successMessage: remoteUrl ? 'Git repository initialized and connected to remote' : 'Git repository initialized'
  }).then((response) => {
    dispatch(setGitEnabled({ collectionUid, enabled: true }));
    if (remoteUrl) {
      dispatch(setGitRemote({ collectionUid, remote: remoteUrl }));
    }
    return response;
  });
};

// Fetch from the remote in the background so the panel can show what's new there.
// Silent: being offline shouldn't produce an error toast just for opening the panel.
export const fetchRemoteChanges = (collectionUid, collectionPath) => (dispatch) => {
  return window.ipcRenderer
    .invoke('renderer:git-fetch', collectionPath)
    .then((response) => {
      if (response.success) {
        dispatch(updateGitStatus({ collectionUid, status: response.status }));
      }
      return response;
    })
    .catch((error) => {
      console.warn('Background fetch failed:', error);
    });
};

// Commit changes
export const commitChanges = (collectionUid, collectionPath, message) => (dispatch) => {
  return runGitAction({
    dispatch,
    collectionUid,
    collectionPath,
    invoke: () => window.ipcRenderer.invoke('renderer:git-commit', collectionPath, message),
    successMessage: 'Changes committed'
  });
};

// Push to remote
export const pushToRemote = (collectionUid, collectionPath) => (dispatch) => {
  return runGitAction({
    dispatch,
    collectionUid,
    collectionPath,
    invoke: () => window.ipcRenderer.invoke('renderer:git-push', collectionPath),
    successMessage: 'Pushed to remote'
  }).then((response) => {
    dispatch(setLastSync({ collectionUid }));
    return response;
  });
};

const describePull = (response) => {
  const changedFiles = response.files?.length || 0;

  if (changedFiles === 0) {
    return 'Already up to date';
  }
  return `Pulled ${changedFiles} changed file${changedFiles === 1 ? '' : 's'}`;
};

// Pull from remote
export const pullFromRemote = (collectionUid, collectionPath) => (dispatch) => {
  return runGitAction({
    dispatch,
    collectionUid,
    collectionPath,
    invoke: () => window.ipcRenderer.invoke('renderer:git-pull', collectionPath),
    successMessage: describePull
  }).then((response) => {
    dispatch(setLastSync({ collectionUid }));
    return response;
  });
};

// Finish a conflicted pull by taking each file whole from the chosen side:
// choices = { 'Posts.yml': 'ours' | 'theirs' }
export const resolveConflicts = (collectionUid, collectionPath, choices) => (dispatch) => {
  return runGitAction({
    dispatch,
    collectionUid,
    collectionPath,
    invoke: () => window.ipcRenderer.invoke('renderer:git-resolve-conflicts', collectionPath, choices),
    successMessage: 'Merged. Push to share the result.'
  });
};

// Leave the merge in progress and open the conflicted files in an editor
export const startManualMerge = (collectionUid, collectionPath) => (dispatch) => {
  return runGitAction({
    dispatch,
    collectionUid,
    collectionPath,
    invoke: () => window.ipcRenderer.invoke('renderer:git-start-manual-merge', collectionPath),
    successMessage: (response) => (response.merged
      ? 'Merged without conflicts'
      : 'Opened conflicting files in your editor')
  });
};

export const openConflictsInEditor = (collectionPath, files) => () => {
  return window.ipcRenderer.invoke('renderer:git-open-in-editor', collectionPath, files);
};

export const finishMerge = (collectionUid, collectionPath) => (dispatch) => {
  return runGitAction({
    dispatch,
    collectionUid,
    collectionPath,
    invoke: () => window.ipcRenderer.invoke('renderer:git-finish-merge', collectionPath),
    successMessage: 'Merge finished. Push to share the result.'
  });
};

export const abortMerge = (collectionUid, collectionPath) => (dispatch) => {
  return runGitAction({
    dispatch,
    collectionUid,
    collectionPath,
    invoke: () => window.ipcRenderer.invoke('renderer:git-abort-merge', collectionPath),
    successMessage: 'Merge cancelled. Your files are back as they were.'
  });
};

// Commit and push in one action
export const commitAndPush = (collectionUid, collectionPath, message) => (dispatch) => {
  return runGitAction({
    dispatch,
    collectionUid,
    collectionPath,
    invoke: () => window.ipcRenderer.invoke('renderer:git-commit-and-push', collectionPath, message),
    successMessage: 'Committed and pushed'
  }).then((response) => {
    dispatch(setLastSync({ collectionUid }));
    return response;
  });
};

// Set remote URL
export const setRemoteUrl = (collectionUid, collectionPath, remoteName, remoteUrl) => (dispatch) => {
  return window.ipcRenderer
    .invoke('renderer:git-set-remote', collectionPath, remoteName, remoteUrl)
    .then((response) => {
      if (!response.success) {
        throw new Error(response.error);
      }
      dispatch(setGitRemote({ collectionUid, remote: remoteUrl }));
      toast.success('Remote URL updated');
      return response;
    })
    .catch((error) => {
      toast.error(`Couldn't set remote URL: ${error.message}`);
      throw error;
    });
};
