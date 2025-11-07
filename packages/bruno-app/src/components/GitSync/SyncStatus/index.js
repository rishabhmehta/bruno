import React from 'react';
import { useSelector } from 'react-redux';
import StyledWrapper from './StyledWrapper';

const SyncStatus = ({ collectionUid }) => {
  const gitState = useSelector((state) => state.git.collections[collectionUid]);

  if (!gitState || !gitState.enabled) {
    return null;
  }

  const getStatusInfo = () => {
    if (gitState.syncing) {
      return {
        color: 'blue',
        text: 'Syncing...',
        pulse: true
      };
    }

    if (gitState.error) {
      return {
        color: 'red',
        text: 'Sync error',
        pulse: false
      };
    }

    if (gitState.pendingChanges > 0) {
      return {
        color: 'yellow',
        text: `${gitState.pendingChanges} pending change${gitState.pendingChanges > 1 ? 's' : ''}`,
        pulse: false
      };
    }

    if (gitState.lastSync) {
      return {
        color: 'green',
        text: 'Synced',
        pulse: false
      };
    }

    return {
      color: 'gray',
      text: 'Not synced',
      pulse: false
    };
  };

  const status = getStatusInfo();

  return (
    <StyledWrapper color={status.color}>
      <div className="sync-status">
        <span className={`status-dot ${status.pulse ? 'pulse' : ''}`} />
        <span className="status-text">{status.text}</span>
      </div>
    </StyledWrapper>
  );
};

export default SyncStatus;
