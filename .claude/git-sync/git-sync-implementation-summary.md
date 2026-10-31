# Git Sync Feature Implementation Summary

**Date:** November 8, 2025
**Objective:** Add complete git sync functionality to Bruno REST client with auto-staging, manual controls, and secret detection.

---

## Files Created

### Backend (Electron)

1. **packages/bruno-electron/src/git/git-service.js** (NEW)
   - Core git operations using `simple-git` library
   - Methods: `isGitRepo`, `initializeRepo`, `getStatus`, `stageAll`, `unstageFile`, `stageFile`, `commit`, `push`, `pull`, `setRemote`, `getRemote`, `getCurrentBranch`, `getHistory`, `scanForSecrets`
   - Secret scanning patterns to prevent committing API keys, tokens, passwords
   - Smart `.gitignore` generation (excludes `environments/`, `*.secrets.bru`, `.env*`)

2. **packages/bruno-electron/src/ipc/git-sync.js** (NEW)
   - IPC handlers for renderer ↔ main process communication
   - Handlers: `git-init`, `git-status`, `git-stage-all`, `git-unstage-file`, `git-commit`, `git-push`, `git-pull`, `git-set-remote`, `git-get-remote`, `git-history`, `git-check-installed`, `git-is-repo`, `git-commit-and-push`

3. **packages/bruno-electron/src/store/git-config.js** (NEW)
   - Persistent git configuration per collection using `electron-store`
   - Stores: enabled state, auto-stage preference, remote URL

### Frontend (React/Redux)

4. **packages/bruno-app/src/providers/ReduxStore/slices/git/index.js** (NEW)
   - Redux slice for git state management per collection
   - State: `enabled`, `initialized`, `remote`, `branch`, `stagedFiles`, `modifiedFiles`, `pendingChanges`, `lastSync`, `syncing`, `error`, `autoStage`
   - Reducers: `initializeGitState`, `updateGitStatus`, `setGitEnabled`, `setGitSyncing`, `setGitError`, `setGitRemote`, `setLastSync`

5. **packages/bruno-app/src/providers/ReduxStore/slices/git/actions.js** (NEW)
   - Async thunk actions with toast notifications
   - Actions: `checkGitInstalled`, `initializeGitRepo`, `fetchGitStatus`, `commitChanges`, `pushToRemote`, `pullFromRemote`, `commitAndPush`, `setRemoteUrl`
   - Proper error handling with `.finally()` to prevent stuck syncing states

6. **packages/bruno-app/src/providers/App/useGitSync.js** (NEW)
   - Custom hook for IPC event listeners
   - Listens to `main:git-status-updated` from file watcher
   - Proper cleanup using returned unsubscribe function

7. **packages/bruno-app/src/components/GitSync/GitPanel/index.js** (NEW)
   - Main git sync modal UI
   - Features: displays branch, last sync time, staged files, modified files, commit message input, Pull/Commit & Push buttons, "Stage All" button, unstage file buttons
   - Handlers: `handleCommitAndPush`, `handlePull`, `handleStageAll`, `handleUnstageFile`

8. **packages/bruno-app/src/components/GitSync/GitPanel/StyledWrapper.js** (NEW)
   - Styled components for git panel
   - Uses Bruno's theme system correctly: `props.theme.colors.text.muted`, `props.theme.button.secondary`, etc.
   - Hover-reveal unstage button with smooth opacity transition

9. **packages/bruno-app/src/components/GitSync/InitializeRepo/index.js** (NEW)
   - UI for initializing git repository
   - Displays "Initialize Git Repository" button

10. **packages/bruno-app/src/components/GitSync/InitializeRepo/StyledWrapper.js** (NEW)
    - Styled components for initialization UI

11. **packages/bruno-app/src/components/GitSync/SyncStatus/index.js** (NEW)
    - Displays git sync status in collection settings

12. **packages/bruno-app/src/components/GitSync/SyncStatus/StyledWrapper.js** (NEW)
    - Styled components for sync status display

13. **packages/bruno-app/src/components/CollectionSettings/GitSync/index.js** (NEW)
    - Git settings tab in collection settings
    - Allows initialization and viewing sync status

## Files Modified

### Backend Modifications

14. **packages/bruno-electron/package.json**
    - Added dependency: `"simple-git": "^3.25.0"`

15. **packages/bruno-electron/src/index.js**
    - Imported and registered `registerGitSyncIpc(mainWindow)`

16. **packages/bruno-electron/src/app/collection-watcher.js**
    - Added auto-staging logic in `add()` function (lines 358-386)
    - Added auto-staging logic in `change()` function (lines 546-574)
    - Auto-stages files when changed through Bruno if git is enabled
    - Sends `main:git-status-updated` IPC event to renderer

### Frontend Modifications

17. **packages/bruno-app/src/providers/ReduxStore/index.js**
    - Imported git reducer: `import gitReducer from './slices/git'`
    - Added to store: `git: gitReducer`

18. **packages/bruno-app/src/providers/App/index.js**
    - Imported `useGitSync` hook
    - Called hook: `useGitSync()`

19. **packages/bruno-app/src/providers/ReduxStore/slices/collections/actions.js**
    - Modified `openCollectionEvent` to initialize git state
    - Checks if directory is git repo on collection open
    - Auto-loads git status and remote URL if repo exists

20. **packages/bruno-app/src/components/RequestTabs/CollectionToolBar/index.js**
    - Added git sync icon with pending changes badge
    - Icon shows when git is enabled for collection
    - Badge displays count of pending changes (staged + modified)
    - Clicking icon opens GitPanel modal

21. **packages/bruno-app/src/components/CollectionSettings/index.js**
    - Added "Git Sync" tab
    - Renders GitSync settings component

22. **package-lock.json**
    - Updated with `simple-git` dependency

---

## Key Features Implemented

### ✅ Git Repository Management
- Initialize git repository from UI
- Auto-create `.gitignore` (excludes `environments/`, `*.secrets.bru`, `.env*`)
- Detect existing git repositories on collection open
- Persist git state across app restarts

### ✅ Auto-Staging
- Files changed through Bruno are automatically staged via file watcher
- Works for both new files (`add` event) and modified files (`change` event)
- Real-time status updates sent to renderer process

### ✅ Manual Staging Controls
- "Stage All" button to manually stage all modified/untracked files
- Unstage button (minus icon) on each staged file
- Unstage button appears on hover with smooth transition

### ✅ Commit & Push
- Custom commit message required
- "Commit & Push" button (disabled until message entered)
- Proper syncing state management (no stuck states)
- Success/error toast notifications

### ✅ Pull from Remote
- "Pull" button to fetch and merge changes
- Shows insertions/deletions in toast notification
- Updates git status after pull

### ✅ Secret Detection
- Pre-commit scanning for potential secrets
- Patterns detected: X-API-Key, API keys, Bearer tokens, passwords, secret keys
- Blocks commit if secrets detected with detailed error message
- Recommends using environment variables

### ✅ Status Display
- Branch name display
- Last sync timestamp
- Staged files count and list
- Modified files count and list
- Git sync icon in toolbar with pending changes badge
- Error messages with proper formatting

### ✅ Smart File Filtering
- Files don't appear in both staged AND modified lists
- Filters out staged files from modified list using Set comparison
- Correct pending changes count (unique files only)

---

## Critical Fixes Applied

### Fix #1: IPC Event Listener Cleanup
**Issue:** `window.ipcRenderer.off is not a function`
**Solution:** Use returned cleanup function from `ipcRenderer.on()`
```javascript
const removeListener = window.ipcRenderer.on('event', handler);
return () => removeListener();
```

### Fix #2: Theme Property Errors
**Issue:** `Cannot read properties of undefined (reading 'bg')`
**Solution:** Use correct Bruno theme paths
- `props.theme.textLight` → `props.theme.colors.text.muted`
- `props.theme.button.primary.bg` → `props.theme.button.secondary.bg`

### Fix #3: Stuck Syncing State
**Issue:** "Syncing..." never resets to false
**Solution:** Added `.finally()` blocks to always reset syncing state

### Fix #4: Git State Not Persisted
**Issue:** Git state lost on app restart
**Solution:** Check and load git status in `openCollectionEvent`

### Fix #5: Duplicate Files in Lists
**Issue:** Files appearing in both staged AND modified
**Solution:** Filter modified files to exclude already-staged files
```javascript
const stagedFiles = new Set(status.staged);
const modifiedFiles = [...status.modified, ...status.not_added].filter(
  file => !stagedFiles.has(file)
);
```

### Fix #6: Unstage File Path Error
**Issue:** `'../../../../../../playground/bruno/packages/bruno-electron/Query Users.bru' is outside repository`
**Solution:** Handle relative paths correctly in `unstageFile`
```javascript
const relativePath = path.isAbsolute(filePath)
  ? path.relative(collectionPath, filePath)
  : filePath;
```

### Fix #7: Environments Folder Not Ignored
**Issue:** Environment files with secrets being committed
**Solution:** Added `environments/` to `.gitignore` template

### Fix #8: Unstage Fails in Brand New Repository
**Issue:** `fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree` when trying to unstage files in a repository with no commits yet
**Root Cause:** `git reset HEAD <file>` only works when there's at least one commit. In brand new repos without any commits, HEAD doesn't exist yet.
**Solution:** Check if HEAD exists before unstaging, use `git rm --cached` for new repos
```javascript
async unstageFile(collectionPath, filePath) {
  const git = simpleGit(collectionPath);
  const relativePath = path.isAbsolute(filePath)
    ? path.relative(collectionPath, filePath)
    : filePath;

  // Check if there are any commits in the repository
  try {
    await git.revparse(['HEAD']);
    // HEAD exists, use reset
    await git.reset(['HEAD', relativePath]);
  } catch (error) {
    // No commits yet (brand new repo), use rm --cached
    await git.raw(['rm', '--cached', relativePath]);
  }

  return { success: true };
}
```

### Fix #9: Git Sync Remains Blocked After Initialization (Windows-Specific)
**Issue:** After initializing git repository on Windows build, git sync buttons remain disabled/blocked
**Root Cause:** `initializeGitRepo` action sets `syncing: true` but lacks `.finally()` block to reset it. When `fetchGitStatus` fails or encounters issues on Windows (path separators, line endings, git not in PATH), the syncing state never resets to `false`, leaving all buttons disabled.
**Platform Impact:** More common on Windows due to:
- CRLF line ending differences in `.gitignore`
- Backslash vs forward slash path separators
- Git executable not in system PATH
**Solution:** Added `.finally()` block to `initializeGitRepo` to always reset syncing state
```javascript
export const initializeGitRepo = (collectionUid, collectionPath) => (dispatch) => {
  dispatch(setGitSyncing({ collectionUid, syncing: true }));

  return window.ipcRenderer
    .invoke('renderer:git-init', collectionPath)
    .then((response) => {
      if (response.success) {
        dispatch(setGitEnabled({ collectionUid, enabled: true }));
        toast.success('Git repository initialized successfully');
        return dispatch(fetchGitStatus(collectionUid, collectionPath));
      } else {
        dispatch(setGitError({ collectionUid, error: response.error }));
        toast.error(`Failed to initialize git: ${response.error}`);
        throw new Error(response.error);
      }
    })
    .catch((error) => {
      dispatch(setGitError({ collectionUid, error: error.message }));
      toast.error(`Error initializing git: ${error.message}`);
      throw error;
    })
    .finally(() => {
      dispatch(setGitSyncing({ collectionUid, syncing: false }));
    });
};
```
**File:** `packages/bruno-app/src/providers/ReduxStore/slices/git/actions.js:36-63`

---

## Architecture Decisions

1. **Collection-based repositories**: Each Bruno collection can have its own git repo
2. **Hybrid staging approach**: Auto-stage for in-app changes, manual controls for external changes
3. **System git usage**: Uses system git installation and credentials (no embedded git)
4. **Per-collection state**: Git state stored separately per collection UID
5. **Real-time updates**: File watcher sends IPC events for immediate UI updates
6. **Secret scanning**: Pre-commit validation to prevent accidental secret exposure

---

## Security Considerations

- `.gitignore` automatically excludes `environments/` folder (contains API keys)
- Secret scanning blocks commits with detected credentials
- Recommends using Bruno's environment variables for sensitive data
- Warning comments in `.gitignore` about reviewing `.bru` files before committing

---

## Testing Checklist

- [x] Initialize new git repository
- [x] Auto-stage files modified through Bruno
- [x] Manual "Stage All" for external changes
- [x] Unstage individual files (works in both new and existing repos)
- [x] Commit with custom message
- [x] Push to remote repository
- [x] Pull from remote repository
- [x] Secret detection blocks commits
- [x] Git state persists across app restarts
- [x] Remote URL auto-detected from git config
- [x] Pending changes badge shows correct count
- [x] Files appear in only one list (staged OR modified)
- [x] Error handling with user-friendly messages
- [x] Cross-platform testing (macOS ✓, Windows ✓)
- [x] Git initialization doesn't block UI on any platform

---

## Dependencies Added

- `simple-git@^3.25.0` - Git operations library for Node.js

---

## Notes

- This implementation does NOT use `isomorphic-git` (pure JS git) because it would require reimplementing authentication, SSH keys, etc.
- Uses system git for better compatibility with existing git configurations
- Auto-staging only triggers for files changed through Bruno's file watcher
- Files modified outside Bruno appear in "Modified Files" and can be staged manually
- The unstage button uses `git reset HEAD <file>` to unstage without losing changes
