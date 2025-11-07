import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { updateGitStatus } from 'providers/ReduxStore/slices/git';

const useGitSync = () => {
  const dispatch = useDispatch();

  useEffect(() => {
    const handleGitStatusUpdate = (data) => {
      const { collectionUid, status } = data;
      dispatch(updateGitStatus({ collectionUid, status }));
    };

    // Listen for git status updates from main process
    const removeGitStatusUpdateListener = window.ipcRenderer.on('main:git-status-updated', handleGitStatusUpdate);

    return () => {
      removeGitStatusUpdateListener();
    };
  }, [dispatch]);
};

export default useGitSync;
