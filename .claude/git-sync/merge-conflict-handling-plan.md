# Merge Conflict Handling - Implementation Plan

**Date:** November 8, 2025
**Objective:** Add merge conflict detection and safe handling to Bruno's git sync feature

---

## Overview

Currently, if a `git pull` operation results in merge conflicts, the user gets a generic error message and the repository is left in a conflicted state. This plan implements **Option 1 (Detect and Show Warning) + Option 3 (Abort on Conflict)** to safely handle merge conflicts.

---

## Strategy

When merge conflicts occur during pull:
1. **Detect** the conflict immediately
2. **Abort** the merge automatically to prevent broken state
3. **Show** clear warning with conflicted file names
4. **Disable** git sync operations until manually resolved
5. **Guide** user to resolve conflicts manually via terminal

---

## Phase 1: Backend - Conflict Detection

### File: `packages/bruno-electron/src/git/git-service.js`

#### 1.1 Add conflict detection method

```javascript
/**
 * Check if repository has merge conflicts
 */
async hasConflicts(collectionPath) {
  const git = simpleGit(collectionPath);
  const status = await git.status();

  // Check for conflicted files
  const conflictedFiles = status.conflicted || [];

  return {
    hasConflicts: conflictedFiles.length > 0,
    conflictedFiles: conflictedFiles
  };
}
```

#### 1.2 Modify pull method to handle conflicts

**Current code:**
```javascript
async pull(collectionPath, remote = 'origin', branch = 'main') {
  const git = simpleGit(collectionPath);
  const result = await git.pull(remote, branch);

  return {
    success: true,
    summary: result.summary,
    files: result.files,
    insertions: result.insertions,
    deletions: result.deletions
  };
}
```

**New code with conflict handling:**
```javascript
async pull(collectionPath, remote = 'origin', branch = 'main') {
  const git = simpleGit(collectionPath);

  try {
    const result = await git.pull(remote, branch);

    // Check for conflicts after pull
    const conflictCheck = await this.hasConflicts(collectionPath);

    if (conflictCheck.hasConflicts) {
      // Abort the merge to restore clean state
      await git.raw(['merge', '--abort']);

      return {
        success: false,
        hasConflicts: true,
        conflictedFiles: conflictCheck.conflictedFiles,
        error: `Merge conflicts detected in ${conflictCheck.conflictedFiles.length} file(s). The merge has been aborted to keep your repository clean. Please resolve conflicts manually:\n\n${conflictCheck.conflictedFiles.map(f => `  - ${f}`).join('\n')}\n\nUse terminal to pull and resolve conflicts, then return to Bruno.`
      };
    }

    return {
      success: true,
      summary: result.summary,
      files: result.files,
      insertions: result.insertions,
      deletions: result.deletions
    };
  } catch (error) {
    // Check if error is due to conflicts
    if (error.message && error.message.includes('CONFLICT')) {
      // Attempt to abort merge
      try {
        await git.raw(['merge', '--abort']);
      } catch (abortError) {
        // Merge abort failed, but we still want to report the conflict
      }

      const conflictCheck = await this.hasConflicts(collectionPath);

      return {
        success: false,
        hasConflicts: true,
        conflictedFiles: conflictCheck.conflictedFiles,
        error: `Merge conflicts detected. The merge has been aborted. Please resolve conflicts manually using terminal.`
      };
    }

    // Other git errors
    throw error;
  }
}
```

---

## Phase 2: Backend - IPC Handler Updates

### File: `packages/bruno-electron/src/ipc/git-sync.js`

#### 2.1 Add conflict check IPC handler

```javascript
// Check for merge conflicts
ipcMain.handle('renderer:git-check-conflicts', async (event, collectionPath) => {
  try {
    const result = await gitService.hasConflicts(collectionPath);
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

#### 2.2 Update pull handler (already modified in git-service.js)

No changes needed - the pull handler will automatically use the new conflict-aware pull method.

---

## Phase 3: Frontend - Redux State Management

### File: `packages/bruno-app/src/providers/ReduxStore/slices/git/index.js`

#### 3.1 Add conflict state to git slice

**Add to initial state:**
```javascript
state.collections[collectionUid] = {
  collectionPath,
  enabled: false,
  initialized: false,
  remote: null,
  branch: 'main',
  stagedFiles: [],
  modifiedFiles: [],
  pendingChanges: 0,
  lastSync: null,
  syncing: false,
  error: null,
  autoStage: true,
  // NEW: Conflict state
  hasConflicts: false,
  conflictedFiles: []
};
```

#### 3.2 Add conflict reducers

```javascript
setGitConflicts: (state, action) => {
  const { collectionUid, hasConflicts, conflictedFiles } = action.payload;
  if (state.collections[collectionUid]) {
    state.collections[collectionUid].hasConflicts = hasConflicts;
    state.collections[collectionUid].conflictedFiles = conflictedFiles || [];
  }
},

clearGitConflicts: (state, action) => {
  const { collectionUid } = action.payload;
  if (state.collections[collectionUid]) {
    state.collections[collectionUid].hasConflicts = false;
    state.collections[collectionUid].conflictedFiles = [];
  }
}
```

### File: `packages/bruno-app/src/providers/ReduxStore/slices/git/actions.js`

#### 3.3 Update pullFromRemote action

**Modify existing pullFromRemote:**
```javascript
export const pullFromRemote = (collectionUid, collectionPath, remote = 'origin', branch = 'main') => (dispatch) => {
  dispatch(setGitSyncing({ collectionUid, syncing: true }));

  return window.ipcRenderer
    .invoke('renderer:git-pull', collectionPath, remote, branch)
    .then((response) => {
      if (response.success) {
        dispatch(setLastSync({ collectionUid }));
        dispatch(clearGitConflicts({ collectionUid })); // Clear any previous conflicts
        toast.success(`Pulled changes: +${response.summary.insertions} -${response.summary.deletions}`);

        // Refresh status
        return dispatch(fetchGitStatus(collectionUid, collectionPath));
      } else if (response.hasConflicts) {
        // Handle merge conflicts
        dispatch(setGitConflicts({
          collectionUid,
          hasConflicts: true,
          conflictedFiles: response.conflictedFiles
        }));
        dispatch(setGitError({ collectionUid, error: response.error }));
        toast.error('Merge conflicts detected - merge aborted');
        throw new Error(response.error);
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
```

#### 3.4 Add action to check for conflicts

```javascript
export const checkForConflicts = (collectionUid, collectionPath) => (dispatch) => {
  return window.ipcRenderer
    .invoke('renderer:git-check-conflicts', collectionPath)
    .then((response) => {
      if (response.success) {
        dispatch(setGitConflicts({
          collectionUid,
          hasConflicts: response.hasConflicts,
          conflictedFiles: response.conflictedFiles
        }));
        return response;
      }
      return response;
    })
    .catch((error) => {
      console.error('Error checking for conflicts:', error);
      throw error;
    });
};
```

---

## Phase 4: Frontend - UI Updates

### File: `packages/bruno-app/src/components/GitSync/GitPanel/index.js`

#### 4.1 Add conflict warning display

**Add after the branch info section:**
```javascript
{/* Conflict Warning */}
{gitState.hasConflicts && (
  <div className="conflict-warning">
    <strong>⚠️ Merge Conflicts Detected</strong>
    <p>The following files have conflicts:</p>
    <ul>
      {gitState.conflictedFiles.map((file, index) => (
        <li key={index}>{file}</li>
      ))}
    </ul>
    <p className="conflict-instructions">
      Git sync operations are disabled. Please resolve conflicts manually:
    </p>
    <ol className="conflict-steps">
      <li>Open terminal in collection directory</li>
      <li>Run: <code>git pull</code></li>
      <li>Resolve conflicts in your editor</li>
      <li>Run: <code>git add .</code></li>
      <li>Run: <code>git commit</code></li>
      <li>Return to Bruno and click "Refresh Status"</li>
    </ol>
    <button
      className="btn btn-refresh"
      onClick={handleRefreshStatus}
    >
      Refresh Status
    </button>
  </div>
)}
```

#### 4.2 Add refresh status handler

```javascript
const handleRefreshStatus = () => {
  dispatch(fetchGitStatus(collection.uid, collection.pathname))
    .then(() => {
      dispatch(checkForConflicts(collection.uid, collection.pathname));
    });
};
```

#### 4.3 Disable buttons when conflicts exist

**Modify existing buttons:**
```javascript
{/* Pull Button */}
<button
  className="btn btn-pull"
  onClick={handlePull}
  disabled={gitState.syncing || gitState.hasConflicts}
>
  <IconDownload size={16} />
  <span>Pull</span>
</button>

{/* Commit & Push Button */}
{gitState.pendingChanges > 0 && (
  <button
    className="btn btn-commit-push"
    onClick={handleCommitAndPush}
    disabled={gitState.syncing || !commitMessage.trim() || gitState.hasConflicts}
  >
    <IconUpload size={16} />
    <span>{gitState.syncing ? 'Syncing...' : 'Commit & Push'}</span>
  </button>
)}

{/* Stage All Button */}
<button
  className="btn btn-stage-all"
  onClick={handleStageAll}
  disabled={gitState.syncing || gitState.hasConflicts}
  title="Stage all modified files"
>
  <IconGitCommit size={16} />
  <span>Stage All</span>
</button>
```

### File: `packages/bruno-app/src/components/GitSync/GitPanel/StyledWrapper.js`

#### 4.4 Add conflict warning styles

```javascript
.conflict-warning {
  padding: 1rem;
  background: #fef3c7;
  border: 2px solid #f59e0b;
  border-radius: 4px;
  margin-bottom: 1.5rem;

  strong {
    display: block;
    color: #92400e;
    font-size: 1rem;
    margin-bottom: 0.5rem;
  }

  p {
    margin: 0.5rem 0;
    color: #78350f;
    font-size: 0.9rem;
  }

  ul {
    margin: 0.5rem 0;
    padding-left: 1.5rem;
    color: #78350f;
    font-family: monospace;
    font-size: 0.85rem;
  }

  li {
    margin: 0.25rem 0;
  }

  .conflict-instructions {
    margin-top: 1rem;
    font-weight: 600;
  }

  .conflict-steps {
    margin: 0.75rem 0;
    padding-left: 1.5rem;
    color: #78350f;
    font-size: 0.85rem;

    li {
      margin: 0.5rem 0;
    }

    code {
      background: rgba(0, 0, 0, 0.1);
      padding: 0.2rem 0.4rem;
      border-radius: 3px;
      font-family: monospace;
    }
  }

  .btn-refresh {
    margin-top: 0.75rem;
    padding: 0.5rem 1rem;
    background: #f59e0b;
    color: white;
    border: none;
    border-radius: 4px;
    font-weight: 500;
    cursor: pointer;

    &:hover {
      background: #d97706;
    }
  }
}
```

---

## Phase 5: Testing Checklist

### Test Scenarios:

- [ ] **Pull with no conflicts**: Should work normally
- [ ] **Pull with merge conflicts**: Should detect, abort, and show warning
- [ ] **Conflicted files list**: Should display all conflicted file names
- [ ] **Buttons disabled during conflict**: Pull, Commit & Push, Stage All should be disabled
- [ ] **Refresh status after manual resolution**: Should clear conflict warning and re-enable buttons
- [ ] **Pull during existing conflict**: Should not attempt pull (button disabled)
- [ ] **Error message clarity**: User should understand what to do
- [ ] **Merge abort success**: Repository should be in clean state after abort

---

## Edge Cases to Handle

1. **Merge abort fails**: Show error but still inform user of conflicts
2. **Conflicts in ignored files**: Should not block operations
3. **Partial merge**: Some files merged, others conflicted
4. **Network failure during pull**: Different error from conflict
5. **User resolves conflicts via Bruno file editor**: May need to detect resolution automatically

---

## User Experience Flow

### Happy Path (No Conflicts):
```
1. User clicks "Pull"
2. Changes downloaded and merged
3. Toast: "Pulled changes: +5 -2"
4. Git status refreshed
5. UI updates with new file counts
```

### Conflict Path:
```
1. User clicks "Pull"
2. Conflicts detected
3. Merge automatically aborted
4. Yellow warning box appears showing conflicted files
5. All git operation buttons disabled
6. User follows instructions to resolve manually
7. User clicks "Refresh Status"
8. If conflicts resolved: warning disappears, buttons enabled
9. If conflicts remain: warning stays, buttons disabled
```

---

## Files to Modify

**Backend:**
- `packages/bruno-electron/src/git/git-service.js` (add `hasConflicts`, modify `pull`)
- `packages/bruno-electron/src/ipc/git-sync.js` (add `git-check-conflicts` handler)

**Frontend Redux:**
- `packages/bruno-app/src/providers/ReduxStore/slices/git/index.js` (add conflict state, reducers)
- `packages/bruno-app/src/providers/ReduxStore/slices/git/actions.js` (modify `pullFromRemote`, add `checkForConflicts`)

**Frontend UI:**
- `packages/bruno-app/src/components/GitSync/GitPanel/index.js` (add warning UI, disable buttons, add refresh handler)
- `packages/bruno-app/src/components/GitSync/GitPanel/StyledWrapper.js` (add conflict warning styles)

---

## Implementation Order

1. **Phase 1**: Backend conflict detection method
2. **Phase 2**: Backend IPC handler
3. **Phase 3**: Redux state and actions
4. **Phase 4**: UI warning component
5. **Phase 5**: Testing and refinement

---

## Benefits of This Approach

✅ **Safe**: Never leaves repository in broken state
✅ **Clear**: User knows exactly what's wrong and how to fix it
✅ **Non-blocking**: Doesn't prevent other operations once resolved
✅ **Simple**: No complex conflict resolution UI to build
✅ **Familiar**: Users comfortable with git can use terminal
✅ **Guided**: Step-by-step instructions for less experienced users

---

## Future Enhancements (Not in this plan)

- Visual diff viewer for conflicted files
- In-app conflict resolution with merge tool
- Auto-detect conflict resolution (watch file changes)
- Conflict resolution suggestions based on file type
- Integration with external merge tools

---

## Notes

- This implementation prioritizes **safety** and **clarity** over automation
- Users who understand git can resolve conflicts quickly via terminal
- Users new to git get step-by-step instructions
- No risk of data loss or broken repository state
- Conflicts are detected early and handled gracefully
