import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { IconX, IconUpload, IconDownload, IconGitCommit, IconMinus } from '@tabler/icons';
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
    if (collection.pathname) {
      dispatch(fetchGitStatus(collection.uid, collection.pathname));
    }
  }, [collection.uid, collection.pathname, dispatch]);

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

  const handleStageAll = () => {
    window.ipcRenderer
      .invoke('renderer:git-stage-all', collection.pathname)
      .then((response) => {
        if (response.success) {
          toast.success('All changes staged');
          dispatch(fetchGitStatus(collection.uid, collection.pathname));
        } else {
          toast.error(`Failed to stage changes: ${response.error}`);
        }
      })
      .catch((error) => {
        toast.error(`Error staging changes: ${error.message}`);
      });
  };

  const handleUnstageFile = (file) => {
    window.ipcRenderer
      .invoke('renderer:git-unstage-file', collection.pathname, file)
      .then((response) => {
        if (response.success) {
          toast.success('File unstaged');
          dispatch(fetchGitStatus(collection.uid, collection.pathname));
        } else {
          toast.error(`Failed to unstage file: ${response.error}`);
        }
      })
      .catch((error) => {
        toast.error(`Error unstaging file: ${error.message}`);
      });
  };

  if (!gitState) {
    return null;
  }

  return (
    <Modal size="md" title="Git Sync" handleCancel={onClose} hideFooter={true}>
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
                    <button
                      className="btn-unstage"
                      onClick={() => handleUnstageFile(file)}
                      disabled={gitState.syncing}
                      title="Unstage this file"
                    >
                      <IconMinus size={14} />
                    </button>
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
              <div className="files-header">
                <h3>Modified Files ({gitState.modifiedFiles.length})</h3>
                <button
                  className="btn btn-stage-all"
                  onClick={handleStageAll}
                  disabled={gitState.syncing}
                  title="Stage all modified files"
                >
                  <IconGitCommit size={16} />
                  <span>Stage All</span>
                </button>
              </div>
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
              <strong>Error:</strong>
              <pre>{gitState.error}</pre>
            </div>
          )}
        </div>
      </StyledWrapper>
    </Modal>
  );
};

export default GitPanel;
