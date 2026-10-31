# Git Conflict Resolution - Long-Term Roadmap

**Date:** November 8, 2025
**Objective:** Build best-in-class conflict resolution for Bruno's git sync with focus on .bru file intelligence

---

## Vision

Handle **80% of merge conflicts without leaving Bruno** while leveraging the structured nature of `.bru` files for smarter conflict resolution than generic git tools.

---

## Key Insight

**Bruno files are structured**, not freeform text. We can:
- Parse conflicts by section (headers, body, auth, scripts)
- Auto-merge independent sections
- Only show conflicts where they truly exist
- Provide intelligent suggestions based on section type

This is **fundamentally better** than treating `.bru` files as plain text.

---

## Phased Roadmap

### ✅ **Phase 1: Detect & Abort** (CURRENT - November 2025)

**Status:** Planned, ready to implement
**Timeline:** 1-2 days
**Effort:** Low

**What it does:**
- Detects merge conflicts during pull
- Automatically aborts merge to keep repo clean
- Shows warning with conflicted file names
- Disables git operations until manually resolved
- Provides step-by-step terminal instructions

**User Experience:**
```
1. User clicks "Pull"
2. Conflict detected → merge aborted
3. Yellow warning box appears
4. Instructions: "Open terminal, run git pull, resolve, commit"
5. User clicks "Refresh Status" when done
```

**Why this first:**
- ✅ Safe (never breaks repo)
- ✅ Simple (1 day to implement)
- ✅ Unblocks git sync feature launch
- ✅ Works for 100% of cases (via terminal)

**See:** `merge-conflict-handling-plan.md`

---

### 🎯 **Phase 2: Quick Resolution Options** (NEXT - Q1 2026)

**Timeline:** 1 week
**Effort:** Medium
**Goal:** Handle 60% of conflicts in-app with one click

#### Features

**1. Conflict Actions per File**
```
┌─────────────────────────────────────────────┐
│ ⚠️  Merge Conflicts Detected (2 files)      │
├─────────────────────────────────────────────┤
│                                             │
│ Get User.bru                                │
│   [Keep Yours] [Keep Theirs] [Edit]        │
│                                             │
│ Update User.bru                             │
│   [Keep Yours] [Keep Theirs] [Edit]        │
│                                             │
│ [Abort Merge] [Continue after resolving]   │
└─────────────────────────────────────────────┘
```

**2. One-Click Resolution**

**"Keep Yours":**
```bash
git checkout --ours "Get User.bru"
git add "Get User.bru"
```

**"Keep Theirs":**
```bash
git checkout --theirs "Get User.bru"
git add "Get User.bru"
```

**"Edit":**
- Opens Monaco editor in modal
- Shows file with conflict markers
- User edits → saves → auto-stages

**3. Batch Operations**
```
[Keep Yours for All] [Keep Theirs for All]
```

#### Implementation

**Backend (`git-service.js`):**
```javascript
/**
 * Resolve conflict by choosing a side
 */
async resolveConflict(collectionPath, filePath, strategy) {
  const git = simpleGit(collectionPath);
  const relativePath = path.isAbsolute(filePath)
    ? path.relative(collectionPath, filePath)
    : filePath;

  if (strategy === 'ours') {
    await git.checkout(['--ours', relativePath]);
  } else if (strategy === 'theirs') {
    await git.checkout(['--theirs', relativePath]);
  }

  // Stage the resolved file
  await git.add(relativePath);

  return { success: true };
}

/**
 * Get conflicted file content with markers
 */
async getConflictedFileContent(collectionPath, filePath) {
  const fullPath = path.join(collectionPath, filePath);
  const content = fs.readFileSync(fullPath, 'utf8');

  return {
    success: true,
    content: content,
    hasMarkers: content.includes('<<<<<<<')
  };
}

/**
 * Save manually resolved file
 */
async saveResolvedFile(collectionPath, filePath, content) {
  const fullPath = path.join(collectionPath, filePath);
  fs.writeFileSync(fullPath, content, 'utf8');

  const git = simpleGit(collectionPath);
  const relativePath = path.relative(collectionPath, fullPath);
  await git.add(relativePath);

  return { success: true };
}
```

**IPC Handlers (`git-sync.js`):**
```javascript
// Resolve conflict with strategy
ipcMain.handle('renderer:git-resolve-conflict', async (event, collectionPath, filePath, strategy) => {
  try {
    const result = await gitService.resolveConflict(collectionPath, filePath, strategy);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Get conflicted file content for editing
ipcMain.handle('renderer:git-get-conflict-content', async (event, collectionPath, filePath) => {
  try {
    const result = await gitService.getConflictedFileContent(collectionPath, filePath);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Save manually resolved file
ipcMain.handle('renderer:git-save-resolved-file', async (event, collectionPath, filePath, content) => {
  try {
    const result = await gitService.saveResolvedFile(collectionPath, filePath, content);
    return result;
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

**Frontend (GitPanel):**
```javascript
const handleResolveConflict = (file, strategy) => {
  window.ipcRenderer
    .invoke('renderer:git-resolve-conflict', collection.pathname, file, strategy)
    .then((response) => {
      if (response.success) {
        toast.success(`Resolved: ${file}`);
        // Refresh conflicts
        dispatch(checkForConflicts(collection.uid, collection.pathname));
      } else {
        toast.error(`Failed to resolve: ${response.error}`);
      }
    });
};

const handleEditConflict = (file) => {
  window.ipcRenderer
    .invoke('renderer:git-get-conflict-content', collection.pathname, file)
    .then((response) => {
      if (response.success) {
        setConflictEditor({
          isOpen: true,
          file: file,
          content: response.content
        });
      }
    });
};

const handleSaveResolvedFile = () => {
  window.ipcRenderer
    .invoke('renderer:git-save-resolved-file',
      collection.pathname,
      conflictEditor.file,
      conflictEditor.content
    )
    .then((response) => {
      if (response.success) {
        toast.success('Conflict resolved');
        setConflictEditor({ isOpen: false, file: null, content: '' });
        dispatch(checkForConflicts(collection.uid, collection.pathname));
      }
    });
};
```

**Conflict Editor Modal:**
```javascript
{conflictEditor.isOpen && (
  <Modal size="lg" title={`Resolve Conflict: ${conflictEditor.file}`} handleCancel={handleCloseEditor}>
    <div className="conflict-editor">
      <div className="editor-help">
        <p>Edit the file below to resolve conflicts. Look for:</p>
        <code>{'<<<<<<< HEAD (your changes)'}</code>
        <code>{'======= (divider)'}</code>
        <code>{'>>>>>>> branch (their changes)'}</code>
      </div>

      <MonacoEditor
        value={conflictEditor.content}
        onChange={(value) => setConflictEditor({ ...conflictEditor, content: value })}
        language="bru"
        height="500px"
      />

      <div className="editor-actions">
        <button onClick={handleCloseEditor}>Cancel</button>
        <button onClick={handleSaveResolvedFile}>Save & Resolve</button>
      </div>
    </div>
  </Modal>
)}
```

#### Why This Phase?

**Handles most real-world Bruno conflicts:**
- 40% - "I want my version" → One click
- 40% - "I want their version" → One click
- 20% - "I need to merge both" → Edit manually

**Low effort, high impact:**
- Uses built-in git commands (`checkout --ours/--theirs`)
- Reuses Monaco editor already in Bruno
- No complex diffing algorithms needed

---

### 🚀 **Phase 3: Smart .bru Section Merging** (Q2-Q3 2026)

**Timeline:** 3-4 weeks
**Effort:** High
**Goal:** Auto-resolve 40% of conflicts, show only real conflicts

#### Concept

Instead of treating `.bru` files as text, parse them into sections:

```
┌─────────────────────────────────────────────┐
│ Get User.bru - Conflict Analysis            │
├─────────────────────────────────────────────┤
│                                             │
│ ✓ meta {}        Auto-merged                │
│ ✓ headers {}     Auto-merged (both added)   │
│ ⚠ body {}        CONFLICT - needs review    │
│ ✓ auth {}        No changes                 │
│ ✓ script:pre     Auto-merged                │
│                                             │
│ [Review Conflicts (1)]                      │
└─────────────────────────────────────────────┘
```

#### Section-Level Conflict Resolution

**Example Conflict:**
```
Base version:
headers {
  content-type: application/json
}

Your version:
headers {
  content-type: application/json
  x-api-key: new-key-123
}

Their version:
headers {
  content-type: application/json
  authorization: Bearer token-456
}

Traditional Git: CONFLICT (both modified headers)

Bruno Smart Merge:
headers {
  content-type: application/json
  x-api-key: new-key-123          ← Your addition
  authorization: Bearer token-456  ← Their addition
}

Result: ✓ Auto-merged (both added different headers)
```

#### Resolution Strategies by Section

| Section | Conflict Type | Strategy | Auto-Resolvable? |
|---------|---------------|----------|------------------|
| `meta { name }` | Different names | Ask user | No |
| `meta { seq }` | Different order | Keep yours | Yes |
| `headers {}` | Different keys added | Merge both | Yes |
| `headers {}` | Same key, different value | Ask user | No |
| `body {}` | Different body types | Ask user | No |
| `body { json }` | Different JSON | Deep merge if possible | Partial |
| `auth {}` | Different auth type | Ask user | No |
| `vars {}` | Different vars added | Merge both | Yes |
| `vars {}` | Same var, different value | Ask user | No |
| `script:pre-request` | Code changes | Show diff | No |
| `tests {}` | Different tests added | Merge both | Yes |
| `docs {}` | Documentation | Merge/concat | Yes |

#### Implementation

**1. Parse .bru into structured format:**
```javascript
async parseConflictedBru(collectionPath, filePath) {
  // Get all three versions
  const baseContent = await this.getFileVersion(collectionPath, filePath, 'base');
  const oursContent = await this.getFileVersion(collectionPath, filePath, 'ours');
  const theirsContent = await this.getFileVersion(collectionPath, filePath, 'theirs');

  // Parse each using Bruno's parser
  const base = await parseRequest(baseContent);
  const ours = await parseRequest(oursContent);
  const theirs = await parseRequest(theirsContent);

  return { base, ours, theirs };
}
```

**2. Detect section-level conflicts:**
```javascript
async analyzeConflicts(base, ours, theirs) {
  const conflicts = [];

  // Check headers
  const headerConflict = this.compareHeaders(base.headers, ours.headers, theirs.headers);
  if (headerConflict.hasConflict) {
    conflicts.push({
      section: 'headers',
      type: headerConflict.type,
      autoResolvable: headerConflict.canAutoResolve,
      resolution: headerConflict.suggestedResolution
    });
  }

  // Check body
  const bodyConflict = this.compareBody(base.body, ours.body, theirs.body);
  // ... similar for other sections

  return conflicts;
}
```

**3. Auto-resolve where possible:**
```javascript
async autoResolveConflicts(base, ours, theirs, conflicts) {
  let resolved = { ...base };

  for (const conflict of conflicts) {
    if (conflict.autoResolvable) {
      switch (conflict.section) {
        case 'headers':
          // Merge both header additions
          resolved.headers = {
            ...ours.headers,
            ...theirs.headers
          };
          break;

        case 'vars':
          // Merge non-overlapping vars
          resolved.vars = this.mergeVars(ours.vars, theirs.vars);
          break;

        // ... other auto-resolvable sections
      }
    }
  }

  return {
    resolved,
    remainingConflicts: conflicts.filter(c => !c.autoResolvable)
  };
}
```

**4. Show only remaining conflicts:**
```javascript
// UI shows:
{
  autoResolved: [
    'headers (merged 2 additions)',
    'vars (merged 3 new variables)',
    'meta.seq (kept your ordering)'
  ],
  needsReview: [
    {
      section: 'body',
      issue: 'Both changed request body',
      options: ['Keep Yours', 'Keep Theirs', 'Edit']
    }
  ]
}
```

#### Why This Phase?

**Bruno-specific intelligence:**
- Headers are almost always additive → auto-merge
- Variables are usually independent → auto-merge
- Scripts rarely conflict (different people work on different requests)

**Huge UX win:**
- "2 sections auto-merged, 1 needs review" feels much better than "file conflicted"
- User only makes decisions where truly ambiguous
- Reduces cognitive load dramatically

**Real-world example:**
```
Developer A: Added x-api-key header, updated description
Developer B: Added authorization header, added test

Traditional Git: CONFLICT in Get User.bru (resolve manually)

Bruno Smart:
✓ Auto-merged headers (both added different keys)
✓ Auto-merged meta (description updated)
✓ Auto-merged tests (test added)
Result: No manual action needed! 🎉
```

---

### 🌟 **Phase 4: Visual Diff Viewer** (Q4 2026)

**Timeline:** 2-3 weeks
**Effort:** Medium-High
**Goal:** Make manual conflict resolution delightful

#### Features

**1. Three-Pane Diff View**
```
┌──────────────┬──────────────┬──────────────┐
│ Your Version │ Base Version │ Their Version│
├──────────────┼──────────────┼──────────────┤
│ headers {    │ headers {    │ headers {    │
│   content:   │   content:   │   content:   │
│   json   ✓   │   json       │   json   ✓   │
│              │              │              │
│   x-api-key: │              │   auth:      │
│   abc123 ←   │              │   bearer → │
│ }            │ }            │ }            │
└──────────────┴──────────────┴──────────────┘

Resolution Preview:
headers {
  content-type: application/json
  ● x-api-key: abc123        [←] [✕] [→]
  ● authorization: bearer    [←] [✕] [→]
}

[Accept All] [Reset] [Save]
```

**2. Line-by-Line Selection**
- Click left arrow: Use yours
- Click right arrow: Use theirs
- Click X: Remove line
- Click line: Edit inline

**3. Intelligent Highlights**
```css
.addition-yours { background: #d4edda; }      /* Green */
.addition-theirs { background: #d1ecf1; }     /* Blue */
.deletion { background: #f8d7da; }            /* Red */
.modification { background: #fff3cd; }        /* Yellow */
```

#### Implementation

**Use existing libraries:**
- `react-diff-view` - Battle-tested diff component
- `diff` / `diff-match-patch` - Diffing algorithm
- Monaco Editor - For inline editing

**Component structure:**
```javascript
<ConflictDiffViewer
  file={conflictedFile}
  baseContent={baseVersion}
  oursContent={ourVersion}
  theirsContent={theirVersion}
  onResolve={(resolvedContent) => saveResolution(resolvedContent)}
/>
```

#### Why This Phase?

**For the 20% complex conflicts:**
- Scripts with code changes
- Complex JSON body modifications
- Multiple people editing same section

**Professional tool:**
- Matches quality of VS Code, GitKraken
- Makes Bruno feel like a complete git client
- Power users can stay in Bruno for everything

---

### 💡 **Phase 5: AI-Assisted Suggestions** (2027+)

**Timeline:** 3-4 weeks
**Effort:** High
**Goal:** Suggest intelligent resolutions for complex conflicts

#### Concept

For conflicts that can't be auto-resolved, analyze and suggest:

```
┌─────────────────────────────────────────────┐
│ 🤖 AI Suggestion for Get User.bru           │
├─────────────────────────────────────────────┤
│                                             │
│ Conflict: Both modified auth section        │
│                                             │
│ Your change:                                │
│   auth:apikey { key: x-api-key }            │
│                                             │
│ Their change:                               │
│   auth:bearer { token: {{jwt}} }            │
│                                             │
│ 💡 Recommendation:                          │
│ Use their change (Bearer token)             │
│                                             │
│ Reasoning:                                  │
│ • Collection standardizing on JWT auth      │
│ • 15 other files use Bearer tokens          │
│ • x-api-key deprecated in last commit       │
│                                             │
│ Confidence: High (87%)                      │
│                                             │
│ [Apply Suggestion] [Ignore] [Edit]          │
└─────────────────────────────────────────────┘
```

#### How It Works

**1. Context Analysis:**
```javascript
async analyzeConflictContext(collectionPath, file, conflict) {
  // Gather context
  const context = {
    // Recent commits
    recentCommits: await getRecentCommits(collectionPath, 10),

    // Other files in collection
    similarFiles: await findSimilarFiles(collectionPath, file),

    // Collection patterns
    commonPatterns: await analyzeCollectionPatterns(collectionPath),

    // User's past resolutions
    userHistory: await getUserResolutionHistory(collectionPath)
  };

  return context;
}
```

**2. LLM Prompt:**
```javascript
const prompt = `
You are an expert at resolving merge conflicts in Bruno API request files.

File: ${file}
Format: .bru (structured API request format)

Conflict Section: ${conflict.section}

Base version:
${conflict.base}

Version A (yours):
${conflict.ours}

Version B (theirs):
${conflict.theirs}

Context:
- Recent commits: ${context.recentCommits.map(c => c.message).join(', ')}
- Similar files mostly use: ${context.commonPatterns.auth}
- Collection naming pattern: ${context.commonPatterns.naming}

Suggest a resolution and explain your reasoning. Consider:
1. Which change aligns with collection standards
2. Whether changes can be merged
3. Impact on API functionality
4. Developer intent from commit messages

Format your response as JSON:
{
  "recommendation": "use_yours" | "use_theirs" | "merge_both" | "custom",
  "reasoning": ["point 1", "point 2", ...],
  "confidence": 0-100,
  "suggestedContent": "..." (if custom)
}
`;

const suggestion = await callLLM(prompt);
return suggestion;
```

**3. Learning from User:**
```javascript
async recordResolution(file, conflict, userChoice, aiSuggestion) {
  // Track whether user followed AI suggestion
  await db.insert('resolutions', {
    file,
    conflict,
    aiSuggestion: aiSuggestion.recommendation,
    userChoice: userChoice,
    agreed: aiSuggestion.recommendation === userChoice,
    timestamp: Date.now()
  });

  // Future suggestions improve based on this
}
```

#### AI Capabilities

**What it can suggest:**

✅ **Pattern matching:**
- "All other requests use Bearer auth → suggest theirs"
- "Collection uses snake_case → fix naming"

✅ **Intent detection:**
- "Commit message says 'deprecate API key' → suggest theirs"
- "Both added headers → suggest merge both"

✅ **Impact analysis:**
- "Changing auth type may break tests"
- "Variable rename affects 5 other files"

✅ **Smart merging:**
- "Combine both JSON bodies (non-overlapping keys)"
- "Keep description from yours, seq from theirs"

**What it won't do:**

❌ Auto-apply suggestions (always ask user)
❌ Resolve without showing original conflict
❌ Hide the conflict markers/diff

#### Why This Phase?

**For the hardest 5% of conflicts:**
- Complex script changes
- Refactors vs feature additions
- Large JSON body modifications

**Saves time:**
- Developer doesn't need to investigate context
- Reduces decision fatigue
- Learns team's preferences over time

**Optional feature:**
- Can be toggled off for privacy
- Works offline with cached patterns
- Falls back to Phase 4 diff viewer

---

## Summary Table

| Phase | Timeline | Effort | Auto-Resolve Rate | Manual Work Reduced |
|-------|----------|--------|-------------------|---------------------|
| 1. Detect & Abort | Nov 2025 | 2 days | 0% | 0% (baseline) |
| 2. Quick Actions | Q1 2026 | 1 week | 60% | High (one click) |
| 3. Smart Sections | Q2-Q3 2026 | 4 weeks | 40% additional | Very High (auto-merge) |
| 4. Visual Diff | Q4 2026 | 3 weeks | 0% (helps manual) | Medium (better UX) |
| 5. AI Suggestions | 2027+ | 4 weeks | 5% additional | High (smart hints) |

**Cumulative impact:**
- Phase 1: Handle via terminal (safe fallback)
- Phase 2: 60% one-click resolution
- Phase 3: 85% total auto-resolved
- Phase 4: Remaining 15% easy to resolve
- Phase 5: 95%+ with AI assistance

---

## Technical Dependencies

### Libraries to Evaluate

**Diffing:**
- ✅ `diff` - Lightweight, well-maintained
- ✅ `diff-match-patch` - Google's algorithm, robust
- ⚠️ `jsdiff` - Deprecated, avoid

**UI Components:**
- ✅ `react-diff-view` - Production-ready diff viewer
- ✅ Monaco Editor - Already in Bruno
- ⚠️ `react-merge-view` - Less maintained

**Git Operations:**
- ✅ `simple-git` - Already using, covers all needs
- ❌ `isomorphic-git` - Overkill, auth complexity

**AI/LLM:**
- ✅ OpenAI API (GPT-4)
- ✅ Anthropic API (Claude)
- ⚠️ Local models (performance concerns)

### Bruno Parser Integration

Already have:
- ✅ `@usebruno/filestore` - Parses `.bru` files
- ✅ `parseRequest()` - Returns structured format
- ✅ JSON serialization - Can rebuild `.bru` from structure

Need to build:
- ❌ Section-level differ
- ❌ Smart merge logic per section
- ❌ Conflict marker injection into parsed format

---

## Success Metrics

### User Experience Metrics

**Time to Resolution:**
- Phase 1: ~3 min (manual terminal)
- Phase 2: ~30 sec (one click)
- Phase 3: ~5 sec (auto-resolved)
- Phase 4: ~1 min (visual editing)
- Phase 5: ~10 sec (apply AI suggestion)

**Cognitive Load:**
- Phase 1: High (need git knowledge)
- Phase 2: Low (3 clear options)
- Phase 3: Very Low (only shown real conflicts)
- Phase 4: Medium (review diff)
- Phase 5: Very Low (trust AI + review)

**Success Rate:**
- Phase 1: 100% (always works via terminal)
- Phase 2: 95% (occasionally pick wrong side)
- Phase 3: 98% (smart auto-merge rarely wrong)
- Phase 4: 99% (visual diff catches mistakes)
- Phase 5: 99%+ (AI + human validation)

### Telemetry to Track

```javascript
// Anonymized conflict resolution stats
{
  totalConflicts: 150,
  autoResolved: 130,        // 87%
  manualResolved: 20,       // 13%

  resolutionMethods: {
    keepYours: 45,          // 30%
    keepTheirs: 40,         // 27%
    autoMerged: 45,         // 30%
    manualEdit: 15,         // 10%
    aiSuggestion: 5         // 3%
  },

  averageTimeSeconds: 8,

  sectionConflicts: {
    headers: { total: 80, autoResolved: 75 },    // 94%
    body: { total: 40, autoResolved: 20 },       // 50%
    auth: { total: 20, autoResolved: 10 },       // 50%
    scripts: { total: 10, autoResolved: 0 }      // 0%
  }
}
```

---

## Risk Mitigation

### Risk 1: Auto-merge creates bugs
**Mitigation:**
- Always show "Auto-merged" badge
- Allow "Undo auto-merge" button
- Git history preserves everything

### Risk 2: Users don't understand section-level conflicts
**Mitigation:**
- Provide educational tooltips
- Show before/after preview
- Link to docs explaining .bru structure

### Risk 3: AI suggestions are wrong
**Mitigation:**
- Never auto-apply (always show for review)
- Show confidence score
- Easy "Ignore" option
- Track accuracy metrics

### Risk 4: Complex edge cases break parser
**Mitigation:**
- Fallback to text-based resolution
- Comprehensive test suite
- Gradual rollout with feature flag

---

## Open Questions

1. **Should we support conflict resolution for non-.bru files?**
   - `.json`, `.env`, `.md` also in collections
   - Phase 2-3 could handle JSON similarly
   - Text files fall back to Phase 4 diff viewer

2. **Should AI suggestions be local or cloud-based?**
   - Cloud: Better quality, needs internet
   - Local: Privacy, works offline, lower quality
   - Hybrid: Local patterns + optional cloud

3. **Should we integrate with external merge tools?**
   - "Open in Beyond Compare"
   - "Open in VS Code"
   - Pros: Power users have preferences
   - Cons: More complexity

4. **Should conflict resolution work for collection.bru and folder.bru?**
   - These files rarely conflict
   - But same logic applies
   - Probably yes for completeness

---

## Competitive Analysis

### How others handle conflicts:

**Postman (Cloud Sync):**
- ❌ No real git integration
- ✅ Conflict-free replicated data types (CRDT)
- ⚠️ Can't use standard git workflows

**Insomnia:**
- ✅ Git sync via plugins
- ❌ No conflict resolution UI
- ⚠️ Falls back to terminal

**HTTPie (Desktop):**
- ❌ No git integration at all
- ⚠️ Local-only storage

**Paw (Mac):**
- ✅ Git sync built-in
- ⚠️ Basic conflict detection
- ❌ No smart resolution

**Bruno's Opportunity:**
- First-class git integration ✅
- Smart .bru file understanding ✅
- Better than generic git tools ✅
- **Unique competitive advantage** 🎯

---

## Next Steps

1. **Implement Phase 1** (merge-conflict-handling-plan.md)
   - Already planned
   - Launch with initial git sync feature
   - Gather user feedback on conflict frequency

2. **Validate Phase 2 with users**
   - Survey: "How do you currently resolve conflicts?"
   - Analytics: Track how many conflicts occur
   - Decision: If >10 conflicts/week, prioritize Phase 2

3. **Prototype Phase 3**
   - Build section-level parser
   - Test auto-merge logic on real conflicts
   - Measure accuracy before full implementation

4. **Monitor usage patterns**
   - Which sections conflict most?
   - Success rate of quick resolutions?
   - Are users confused by any patterns?

---

## Conclusion

This roadmap transforms conflict resolution from **"scary git problem"** to **"smart auto-merge with easy review"** by leveraging Bruno's unique advantage: **structured .bru files**.

**Timeline:**
- ✅ Phase 1: Nov 2025 (2 days)
- 🎯 Phase 2: Q1 2026 (1 week)
- 🚀 Phase 3: Q2-Q3 2026 (1 month)
- 🌟 Phase 4: Q4 2026 (3 weeks)
- 💡 Phase 5: 2027+ (1 month)

**Impact:**
- 60% conflicts resolved in one click (Phase 2)
- 85% conflicts auto-resolved (Phase 3)
- 95%+ with AI assistance (Phase 5)

**Competitive advantage:**
Bruno becomes the **only API client with intelligent git conflict resolution** built specifically for API request files.
