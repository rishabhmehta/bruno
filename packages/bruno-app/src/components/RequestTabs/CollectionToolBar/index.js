import React, { useState } from 'react';
import { uuid } from 'utils/common';
import { IconFiles, IconRun, IconEye, IconSettings, IconGitBranch } from '@tabler/icons';
import EnvironmentSelector from 'components/Environments/EnvironmentSelector';
import { addTab } from 'providers/ReduxStore/slices/tabs';
import { useDispatch, useSelector } from 'react-redux';
import ToolHint from 'components/ToolHint';
import StyledWrapper from './StyledWrapper';
import JsSandboxMode from 'components/SecuritySettings/JsSandboxMode';
import GitPanel from 'components/GitSync/GitPanel';

const CollectionToolBar = ({ collection }) => {
  const dispatch = useDispatch();
  const [showGitPanel, setShowGitPanel] = useState(false);

  // Get git state from Redux
  const gitState = useSelector((state) => state.git.collections[collection.uid]);
  const pendingChanges = gitState?.pendingChanges || 0;

  const handleRun = () => {
    dispatch(
      addTab({
        uid: uuid(),
        collectionUid: collection.uid,
        type: 'collection-runner'
      })
    );
  };

  const viewVariables = () => {
    dispatch(
      addTab({
        uid: uuid(),
        collectionUid: collection.uid,
        type: 'variables'
      })
    );
  };

  const viewCollectionSettings = () => {
    dispatch(
      addTab({
        uid: collection.uid,
        collectionUid: collection.uid,
        type: 'collection-settings'
      })
    );
  };

  return (
    <StyledWrapper>
      <div className="flex items-center p-2">
        <div className="flex flex-1 items-center cursor-pointer hover:underline" onClick={viewCollectionSettings}>
          <IconFiles size={18} strokeWidth={1.5} />
          <span className="ml-2 mr-4 font-semibold">{collection?.name}</span>
        </div>
        <div className="flex flex-3 items-center justify-end">
          <span className="mr-2">
            <JsSandboxMode collection={collection} />
          </span>

          {/* Git Sync Icon */}
          {gitState && gitState.enabled && (
            <span className="mr-3 relative">
              <ToolHint text="Git Sync" toolhintId="GitSyncToolhintId" place="bottom">
                <div className="cursor-pointer relative inline-flex" onClick={() => setShowGitPanel(!showGitPanel)}>
                  <IconGitBranch size={18} strokeWidth={1.5} />
                  {pendingChanges > 0 && (
                    <span className="absolute -top-1 -right-1 bg-yellow-500 text-white text-xs rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 font-semibold" style={{ fontSize: '10px' }}>
                      {pendingChanges}
                    </span>
                  )}
                </div>
              </ToolHint>
            </span>
          )}

          <span className="mr-3">
            <ToolHint text="Runner" toolhintId="RunnnerToolhintId" place='bottom'>
              <IconRun className="cursor-pointer" size={18} strokeWidth={1.5} onClick={handleRun} />
            </ToolHint>
          </span>
          <span className="mr-3">
            <ToolHint text="Variables" toolhintId="VariablesToolhintId">
              <IconEye className="cursor-pointer" size={18} strokeWidth={1.5} onClick={viewVariables} />
            </ToolHint>
          </span>
          <span className="mr-3">
            <ToolHint text="Collection Settings" toolhintId="CollectionSettingsToolhintId">
              <IconSettings className="cursor-pointer" size={18} strokeWidth={1.5} onClick={viewCollectionSettings} />
            </ToolHint>
          </span>
          <span>
            <EnvironmentSelector collection={collection} />
          </span>
        </div>
      </div>

      {/* Git Panel Modal */}
      {showGitPanel && (
        <GitPanel
          collection={collection}
          onClose={() => setShowGitPanel(false)}
        />
      )}
    </StyledWrapper>
  );
};

export default CollectionToolBar;
