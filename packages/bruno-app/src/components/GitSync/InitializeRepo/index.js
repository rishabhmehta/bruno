import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import Modal from 'components/Modal';
import { initializeGitRepo, setRemoteUrl } from 'providers/ReduxStore/slices/git/actions';
import toast from 'react-hot-toast';
import StyledWrapper from './StyledWrapper';

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
      <StyledWrapper>
        <div className="init-repo-content">
          <p className="description">
            Initialize a git repository for this collection to enable version control and syncing.
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
              You can add this later in collection settings
            </p>
          </div>

          <div className="actions">
            <button
              className="btn btn-secondary"
              onClick={onClose}
              disabled={initializing}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleInitialize}
              disabled={initializing}
            >
              {initializing ? 'Initializing...' : 'Initialize'}
            </button>
          </div>
        </div>
      </StyledWrapper>
    </Modal>
  );
};

export default InitializeRepo;
