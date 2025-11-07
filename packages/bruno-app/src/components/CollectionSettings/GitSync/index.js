import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import toast from 'react-hot-toast';
import {
  initializeGitRepo,
  setRemoteUrl,
  checkGitInstalled
} from 'providers/ReduxStore/slices/git/actions';
import { setGitEnabled, initializeGitState } from 'providers/ReduxStore/slices/git';
import StyledWrapper from './StyledWrapper';

const GitSync = ({ collection }) => {
  const dispatch = useDispatch();
  const gitState = useSelector((state) => state.git.collections[collection.uid]);
  const gitInstalled = useSelector((state) => state.git.gitInstalled);

  const [remoteUrl, setRemoteUrlValue] = useState('');
  const [initializing, setInitializing] = useState(false);

  useEffect(() => {
    // Check if git is installed
    if (gitInstalled === null) {
      dispatch(checkGitInstalled());
    }

    // Initialize git state for this collection if it doesn't exist
    if (!gitState) {
      dispatch(initializeGitState({
        collectionUid: collection.uid,
        collectionPath: collection.pathname
      }));
    } else if (gitState.remote) {
      setRemoteUrlValue(gitState.remote);
    }
  }, [collection.uid, collection.pathname, gitState, gitInstalled, dispatch]);

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
      })
      .catch((error) => {
        console.error('Failed to initialize git:', error);
      })
      .finally(() => {
        setInitializing(false);
      });
  };

  const handleRemoteUrlUpdate = () => {
    if (remoteUrl.trim()) {
      dispatch(setRemoteUrl(collection.uid, collection.pathname, 'origin', remoteUrl.trim()))
        .catch((error) => {
          console.error('Failed to update remote URL:', error);
        });
    }
  };

  const handleToggleGit = (enabled) => {
    dispatch(setGitEnabled({ collectionUid: collection.uid, enabled }));
    if (enabled) {
      toast.success('Git sync enabled for this collection');
    } else {
      toast.success('Git sync disabled for this collection');
    }
  };

  if (gitInstalled === false) {
    return (
      <StyledWrapper>
        <div className="git-settings">
          <div className="warning-message">
            <h3>Git Not Installed</h3>
            <p>
              Git is not installed on your system. Please install git to use this feature.
            </p>
            <p>
              Visit <a href="https://git-scm.com/downloads" target="_blank" rel="noopener noreferrer">git-scm.com</a> to download and install git.
            </p>
          </div>
        </div>
      </StyledWrapper>
    );
  }

  if (!gitState || !gitState.initialized) {
    return (
      <StyledWrapper>
        <div className="git-settings">
          <h3>Initialize Git Repository</h3>
          <p className="description">
            Initialize a git repository for this collection to enable version control and automatic syncing.
          </p>

          <div className="form-group">
            <label htmlFor="remote-url">
              Remote Repository URL <span className="optional">(Optional)</span>
            </label>
            <input
              id="remote-url"
              type="text"
              className="input-field"
              placeholder="https://github.com/username/repo.git"
              value={remoteUrl}
              onChange={(e) => setRemoteUrlValue(e.target.value)}
              disabled={initializing}
            />
            <p className="helper-text">
              You can add this later after initialization
            </p>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleInitialize}
            disabled={initializing}
          >
            {initializing ? 'Initializing...' : 'Initialize Git Repository'}
          </button>
        </div>
      </StyledWrapper>
    );
  }

  return (
    <StyledWrapper>
      <div className="git-settings">
        <h3>Git Sync Settings</h3>

        <div className="settings-section">
          <div className="setting-item">
            <label className="toggle-label">
              <input
                type="checkbox"
                checked={gitState.enabled}
                onChange={(e) => handleToggleGit(e.target.checked)}
              />
              <span>Enable Git Sync</span>
            </label>
            <p className="helper-text">
              Show git sync icon in toolbar and enable auto-staging of changes
            </p>
          </div>
        </div>

        <div className="settings-section">
          <h4>Repository Information</h4>

          <div className="info-item">
            <span className="label">Current Branch:</span>
            <span className="value">{gitState.branch || 'main'}</span>
          </div>

          <div className="info-item">
            <span className="label">Pending Changes:</span>
            <span className="value">{gitState.pendingChanges || 0}</span>
          </div>

          {gitState.lastSync && (
            <div className="info-item">
              <span className="label">Last Synced:</span>
              <span className="value">{new Date(gitState.lastSync).toLocaleString()}</span>
            </div>
          )}
        </div>

        <div className="settings-section">
          <h4>Remote Repository</h4>

          <div className="form-group">
            <label htmlFor="remote-url-update">Remote URL</label>
            <div className="input-group">
              <input
                id="remote-url-update"
                type="text"
                className="input-field"
                placeholder="https://github.com/username/repo.git"
                value={remoteUrl}
                onChange={(e) => setRemoteUrlValue(e.target.value)}
              />
              <button
                className="btn btn-secondary"
                onClick={handleRemoteUrlUpdate}
                disabled={!remoteUrl.trim()}
              >
                Update
              </button>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="info-box">
            <h4>How Git Sync Works</h4>
            <ul>
              <li>Files are automatically staged when you edit them</li>
              <li>Click the git icon in the toolbar to commit and push changes</li>
              <li>Use the Pull button to get updates from the remote repository</li>
              <li>Git uses your system's configured credentials (SSH keys or HTTPS tokens)</li>
            </ul>
          </div>
        </div>
      </div>
    </StyledWrapper>
  );
};

export default GitSync;
