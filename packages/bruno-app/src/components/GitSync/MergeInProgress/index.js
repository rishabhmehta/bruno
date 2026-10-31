import React from 'react';
import { useDispatch } from 'react-redux';
import classnames from 'classnames';
import { openConflictsInEditor, finishMerge, abortMerge } from 'providers/ReduxStore/slices/git/actions';
import StyledWrapper from './StyledWrapper';

// Toasts and the error box are handled by the git actions; only the rejection is swallowed here.
const ignoreHandledError = () => {};

const describeFile = (file, unresolved, invalidByFile) => {
  if (unresolved.has(file)) {
    return { state: 'needs-fixing', label: 'Needs fixing' };
  }
  if (invalidByFile.has(file)) {
    return { state: 'is-invalid', label: 'Can\'t be read', detail: invalidByFile.get(file) };
  }
  return { state: 'is-fixed', label: 'Fixed' };
};

/**
 * A merge left in progress for the user to resolve in their editor. Progress updates as
 * files are saved: a file counts as fixed once it has no conflict markers and Bruno can
 * parse it.
 */
const MergeInProgress = ({ collection, conflictedFiles, unresolvedFiles, invalidFiles, syncing }) => {
  const dispatch = useDispatch();
  const unresolved = new Set(unresolvedFiles);
  const invalidByFile = new Map(invalidFiles.map(({ file, error }) => [file, error]));
  // VS Code stages a file as soon as it is resolved, so it leaves the conflicted list;
  // keep showing it while Bruno still can't read it.
  const files = [...new Set([...conflictedFiles, ...invalidByFile.keys()])];
  const filesNeedingWork = files.filter((file) => unresolved.has(file) || invalidByFile.has(file));
  const fixedCount = files.length - filesNeedingWork.length;

  const handleOpenInEditor = () => {
    dispatch(openConflictsInEditor(collection.pathname, filesNeedingWork.length ? filesNeedingWork : files));
  };

  const handleFinish = () => {
    dispatch(finishMerge(collection.uid, collection.pathname)).catch(ignoreHandledError);
  };

  const handleCancel = () => {
    dispatch(abortMerge(collection.uid, collection.pathname)).catch(ignoreHandledError);
  };

  return (
    <StyledWrapper data-testid="git-merge-in-progress">
      <div className="merge-title">Merge in progress</div>
      <p className="merge-help">
        In each file, find the blocks between <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code> and{' '}
        <code>&gt;&gt;&gt;&gt;&gt;&gt;&gt;</code>, keep the lines you want, delete the markers, and save. In VS Code
        use <em>Accept Current</em> or <em>Accept Incoming</em> above each block. Avoid <em>Accept Both</em> on a
        setting like <code>url:</code>: a request can't have the same setting twice. Until you finish, these requests
        may show as broken in Bruno.
      </p>

      {files.length > 0 && (
        // divs, not ul/li: this panel renders inside RequestTabs, whose `li` rules style every list item as a tab
        <div className="merge-files" role="list">
          {files.map((file) => {
            const { state, label, detail } = describeFile(file, unresolved, invalidByFile);
            return (
              <div key={file} className="merge-file" role="listitem">
                <div className="merge-file-row">
                  <span className="file-name">{file}</span>
                  <span className={classnames('file-state', state)}>{label}</span>
                </div>
                {detail && <div className="file-error">{detail}</div>}
              </div>
            );
          })}
        </div>
      )}

      <div className="merge-actions">
        <button type="button" className="secondary-button" onClick={handleOpenInEditor} disabled={syncing}>
          Open in VS Code
        </button>
        <button type="button" className="secondary-button" onClick={handleCancel} disabled={syncing} data-testid="git-merge-cancel">
          Cancel merge
        </button>
        <button
          type="button"
          className="finish-button"
          onClick={handleFinish}
          disabled={syncing || filesNeedingWork.length > 0}
          data-testid="git-merge-finish"
        >
          {filesNeedingWork.length > 0 ? `Finish merge (${fixedCount}/${files.length} fixed)` : 'Finish merge'}
        </button>
      </div>
    </StyledWrapper>
  );
};

export default MergeInProgress;
