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
    })
    .finally(() => {
      dispatch(setGitSyncing({ collectionUid, syncing: false }));
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
    })
    .finally(() => {
      dispatch(setGitSyncing({ collectionUid, syncing: false }));
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
    })
    .finally(() => {
      dispatch(setGitSyncing({ collectionUid, syncing: false }));
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
    })
    .finally(() => {
      dispatch(setGitSyncing({ collectionUid, syncing: false }));
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
