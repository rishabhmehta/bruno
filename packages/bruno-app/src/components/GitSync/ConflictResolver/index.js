import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import classnames from 'classnames';
import { IconChevronDown, IconChevronRight } from '@tabler/icons';
import { resolveConflicts, startManualMerge } from 'providers/ReduxStore/slices/git/actions';
import StyledWrapper from './StyledWrapper';

const SIDES = [
  { value: 'ours', label: 'Yours' },
  { value: 'theirs', label: 'Remote' }
];

// Toasts and the error box are handled by the git actions; only the rejection is swallowed here.
const ignoreHandledError = () => {};

/**
 * Shown after a pull stopped on conflicts. The user picks, per file, whose whole version
 * to keep, or hands the merge to their editor instead.
 */
const ConflictResolver = ({ collection, conflictDetails, syncing }) => {
  const dispatch = useDispatch();
  const files = conflictDetails.map(({ file }) => file);
  const [choices, setChoices] = useState({});
  const [expandedFiles, setExpandedFiles] = useState(() => new Set(files.length === 1 ? files : []));

  const chosenCount = files.filter((file) => choices[file]).length;
  const allChosen = chosenCount === files.length;

  const chooseSide = (file, side) => setChoices((previous) => ({ ...previous, [file]: side }));
  const chooseSideForAll = (side) => setChoices(Object.fromEntries(files.map((file) => [file, side])));

  const toggleExpanded = (file) => {
    setExpandedFiles((previous) => {
      const next = new Set(previous);
      if (next.has(file)) {
        next.delete(file);
      } else {
        next.add(file);
      }
      return next;
    });
  };

  const handleFinish = () => {
    dispatch(resolveConflicts(collection.uid, collection.pathname, choices)).catch(ignoreHandledError);
  };

  const handleResolveInEditor = () => {
    dispatch(startManualMerge(collection.uid, collection.pathname)).catch(ignoreHandledError);
  };

  return (
    <StyledWrapper data-testid="git-conflicts">
      <div className="resolver-title">
        {files.length === 1 ? '1 file was' : `${files.length} files were`} changed both here and on the remote
      </div>
      <p className="resolver-help">
        The pull was cancelled, so nothing has changed yet. For each file, pick whose version to keep. The whole
        file is taken from that side. Changes to all other files, from both sides, are kept.
      </p>

      {files.length > 1 && (
        <div className="bulk-actions">
          <span>Use for all files:</span>
          {SIDES.map(({ value, label }) => (
            <button key={value} type="button" className="side-button" onClick={() => chooseSideForAll(value)} disabled={syncing}>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* divs, not ul/li: this panel renders inside RequestTabs, whose `li` rules style every list item as a tab */}
      <div className="conflict-files" role="list">
        {conflictDetails.map(({ file, hunks }) => {
          const isExpanded = expandedFiles.has(file);
          return (
            <div key={file} className="conflict-file" role="listitem">
              <div className="conflict-file-row">
                <button
                  type="button"
                  className="toggle-details"
                  onClick={() => toggleExpanded(file)}
                  aria-expanded={isExpanded}
                  title={isExpanded ? 'Hide differences' : 'Show differences'}
                >
                  {isExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                  <span className="file-name">{file}</span>
                </button>
                <div className="side-picker" role="radiogroup" aria-label={`Version to keep for ${file}`}>
                  {SIDES.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={choices[file] === value}
                      className={classnames('side-button', { selected: choices[file] === value })}
                      onClick={() => chooseSide(file, value)}
                      disabled={syncing}
                      data-testid={`git-conflict-${value}-${file}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {isExpanded && (
                <div className="conflict-hunks">
                  {hunks.length === 0 && <p className="resolver-help">Couldn't load the conflicting lines for this file.</p>}
                  {hunks.map((hunk, index) => (
                    <div key={index} className="conflict-hunk">
                      <div className="conflict-side">
                        <span className="conflict-side-label">Yours</span>
                        <pre>{hunk.ours || '(removed)'}</pre>
                      </div>
                      <div className="conflict-side">
                        <span className="conflict-side-label">Remote</span>
                        <pre>{hunk.theirs || '(removed)'}</pre>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="resolver-actions">
        <button type="button" className="link-button" onClick={handleResolveInEditor} disabled={syncing}>
          Resolve in VS Code instead
        </button>
        <button
          type="button"
          className="finish-button"
          onClick={handleFinish}
          disabled={!allChosen || syncing}
          data-testid="git-conflicts-finish"
        >
          {allChosen ? 'Finish merge' : `Finish merge (${chosenCount}/${files.length} chosen)`}
        </button>
      </div>
    </StyledWrapper>
  );
};

export default ConflictResolver;
