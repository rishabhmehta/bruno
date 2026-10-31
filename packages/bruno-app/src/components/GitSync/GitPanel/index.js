import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { IconUpload, IconDownload, IconGitCommit, IconMinus, IconArrowUp, IconArrowDown } from '@tabler/icons';
import Modal from 'components/Modal';
import toast from 'react-hot-toast';
import ConflictResolver from 'components/GitSync/ConflictResolver';
import MergeInProgress from 'components/GitSync/MergeInProgress';
import {
  fetchGitStatus,
  fetchRemoteChanges,
  commitAndPush,
  pushToRemote,
  pullFromRemote
} from 'providers/ReduxStore/slices/git/actions';
import StyledWrapper from './StyledWrapper';

// Toasts and the error box are handled by the git actions; callers only swallow the rejection.
const ignoreHandledError = () => {};

const GitPanel = ({ collection, onClose }) => {
  const dispatch = useDispatch();
  const gitState = useSelector((state) => state.git.collections[collection.uid]);

  const [commitMessage, setCommitMessage] = useState('');

  useEffect(() => {
    if (collection.pathname) {
      dispatch(fetchGitStatus(collection.uid, collection.pathname));
      dispatch(fetchRemoteChanges(collection.uid, collection.pathname));
    }
  }, [collection.uid, collection.pathname, dispatch]);

  const handleCommitAndPush = () => {
    if (!commitMessage.trim()) {
      toast.error('Please enter a commit message');
      return;
    }

    dispatch(commitAndPush(collection.uid, collection.pathname, commitMessage))
      .then(() => setCommitMessage(''))
      .catch((error) => {
        // The commit itself may have succeeded even though the push failed.
        if (/committed, but not pushed/.test(error.message)) {
          setCommitMessage('');
        }
      });
  };

  const handlePull = () => {
    dispatch(pullFromRemote(collection.uid, collection.pathname)).catch(ignoreHandledError);
  };

  const handlePush = () => {
    dispatch(pushToRemote(collection.uid, collection.pathname)).catch(ignoreHandledError);
  };

  const handleStageAll = () => {
    window.ipcRenderer
      .invoke('renderer:git-stage-all', collection.pathname)
      .then((response) => {
        if (response.success) {
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

  const untrackedFiles = new Set(gitState.untrackedFiles || []);
  const conflicts = gitState.conflicts || [];
  const conflictDetails = gitState.conflictDetails?.length
    ? gitState.conflictDetails
    : conflicts.map((file) => ({ file, hunks: [] }));
  const hasStagedFiles = gitState.stagedFiles.length > 0;
  // While behind, a push is always rejected; pulling (and resolving any conflict) comes first.
  const canPushCommits = gitState.hasRemote
    && gitState.ahead > 0
    && gitState.behind === 0
    && conflicts.length === 0
    && !hasStagedFiles;

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
            {gitState.hasRemote ? (
              <div className="sync-summary" data-testid="git-sync-summary">
                <span title="Commits on the remote that you don't have yet">
                  <IconArrowDown size={14} /> {gitState.behind} on remote
                </span>
                <span title="Your commits that aren't on the remote yet">
                  <IconArrowUp size={14} /> {gitState.ahead} to push
                </span>
              </div>
            ) : (
              <div className="last-sync">No remote set. Add one in Collection Settings → Git Sync to push and pull.</div>
            )}
            {gitState.lastSync && (
              <div className="last-sync">
                Last synced: {new Date(gitState.lastSync).toLocaleString()}
              </div>
            )}
          </div>

          {gitState.mergeInProgress ? (
            <MergeInProgress
              collection={collection}
              conflictedFiles={gitState.mergeConflictedFiles || []}
              unresolvedFiles={gitState.unresolvedFiles || []}
              invalidFiles={gitState.invalidFiles || []}
              syncing={gitState.syncing}
            />
          ) : (
            <>
              {conflicts.length > 0 && (
                <ConflictResolver
                  key={conflicts.join('|')}
                  collection={collection}
                  conflictDetails={conflictDetails}
                  syncing={gitState.syncing}
                />
              )}

              {/* Staged Files */}
              <div className="files-section">
                <h3>Staged Changes ({gitState.stagedFiles.length})</h3>
                {hasStagedFiles ? (
                  // divs, not ul/li: this panel renders inside RequestTabs, whose `li` rules style every list item as a tab
                  <div className="file-list" role="list">
                    {gitState.stagedFiles.map((file, index) => (
                      <div key={index} className="file-item" role="listitem">
                        <span className="file-status staged">S</span>
                        <span className="file-path">{file}</span>
                        <button
                          className="btn-unstage"
                          onClick={() => handleUnstageFile(file)}
                          disabled={gitState.syncing}
                          title="Unstage this file"
                        >
                          <IconMinus size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-changes">No staged changes</p>
                )}
              </div>

              {/* Modified Files */}
              {gitState.modifiedFiles.length > 0 && (
                <div className="files-section">
                  <div className="files-header">
                    <h3>Changed Files ({gitState.modifiedFiles.length})</h3>
                    <button
                      className="btn btn-stage-all"
                      onClick={handleStageAll}
                      disabled={gitState.syncing}
                      title="Stage all changed files"
                    >
                      <IconGitCommit size={16} />
                      <span>Stage All</span>
                    </button>
                  </div>
                  <div className="file-list" role="list">
                    {gitState.modifiedFiles.map((file, index) => {
                      const isNew = untrackedFiles.has(file);
                      return (
                        <div key={index} className="file-item" role="listitem">
                          <span
                            className={`file-status ${isNew ? 'untracked' : 'modified'}`}
                            title={isNew ? 'New file' : 'Modified'}
                          >
                            {isNew ? 'U' : 'M'}
                          </span>
                          <span className="file-path">{file}</span>
                        </div>
                      );
                    })}
                  </div>
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
                  {!hasStagedFiles && <p className="hint">Stage the files you want to commit first.</p>}
                </div>
              )}

              {/* Actions */}
              <div className="actions">
                <button
                  className="btn btn-pull"
                  onClick={handlePull}
                  disabled={gitState.syncing || !gitState.hasRemote}
                  data-testid="git-pull"
                >
                  <IconDownload size={16} />
                  <span>{gitState.behind > 0 ? `Pull (${gitState.behind})` : 'Pull'}</span>
                </button>

                {canPushCommits && (
                  <button
                    className="btn btn-commit-push"
                    onClick={handlePush}
                    disabled={gitState.syncing}
                    data-testid="git-push"
                  >
                    <IconUpload size={16} />
                    <span>{gitState.syncing ? 'Syncing...' : `Push (${gitState.ahead})`}</span>
                  </button>
                )}

                {gitState.pendingChanges > 0 && (
                  <button
                    className="btn btn-commit-push"
                    onClick={handleCommitAndPush}
                    disabled={gitState.syncing || !hasStagedFiles || !commitMessage.trim()}
                    data-testid="git-commit-push"
                  >
                    <IconUpload size={16} />
                    <span>{gitState.syncing ? 'Syncing...' : 'Commit & Push'}</span>
                  </button>
                )}
              </div>
            </>
          )}

          {/* Error Display */}
          {gitState.error && conflicts.length === 0 && (
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
