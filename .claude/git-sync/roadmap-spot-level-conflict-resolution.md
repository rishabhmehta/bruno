# Roadmap: resolving conflicts inside one file

**Written:** 31 Oct 2026
**Status:** planned, not built

## Where we are today

When a pull hits a conflict, Bruno offers two ways out:

| Path | What it does | Good for |
|---|---|---|
| **A: per file** (in Bruno) | For each conflicting file, pick **Yours** or **Remote**. The whole file comes from that side. | Most request files. One click per file, plus "use for all". |
| **C: VS Code** | Leaves the merge open and opens the files in VS Code. You edit, save, then **Finish merge** in Bruno. | Anything that needs lines from both sides. |

Changes in files that did **not** conflict are always kept, from both sides.

### The gap

If one file has two separate clashes, say the URL and the timeout, you can't keep
your URL and the remote timeout without leaving Bruno for VS Code. The panel already
*shows* every clashing spot, so choosing per spot is a small step.

---

## Phase 1: spot-level choice, directly in Bruno

**What the user sees:** expand a file and each clashing spot has its own **Yours / Remote**
toggle. The file-level buttons still exist and set every spot in that file at once.
**Finish merge** stays disabled until every spot has a choice.

```
Posts.yml                                    [ Yours ] [ Remote ]
  Spot 1  url + params      ( ) Yours  (•) Remote
  Spot 2  timeout           (•) Yours  ( ) Remote
```

### The rule that keeps requests valid

Git puts lines that sit next to each other into **one spot**. In a request file, the `url:`
line and the `params:` block sit together, so they stay in one spot and can only be taken
from the same side. That is what stops a request from ending up with one person's URL and
the other person's params.

So the granularity is what git gives us. Two settings that are far apart in the file
(like `url` and `timeout`) can be chosen separately.

### Design

1. **Backend: build the file from the chosen spots.**
   - `getConflictDetails` already runs `git merge-tree` and parses the result into spots.
     Give every spot a stable id (its index in the file) and return the text around it.
   - New `resolveConflicts` input: `{ 'Posts.yml': { spots: ['ours', 'theirs'] } }`,
     alongside today's whole-file `'ours' | 'theirs'`.
   - Rebuild the file from the merged text with each spot replaced by the chosen side,
     write it, `git add` it, commit. Same safety as today: any failure aborts the merge.
2. **Always validate the result.** Run the rebuilt file through `validateCollectionFile`
   (already in `git-service.js`). If Bruno can't read the combined file, refuse and say
   why, in the panel, before anything is committed. This is the check that would have
   caught the round-5 duplicate `url:` bug.
3. **UI:** extend `ConflictResolver`. Per-spot radio pair inside the expanded file, file
   buttons set all spots, a spot counter in the Finish button ("Finish merge (3/5 chosen)").
4. **Edge cases to decide while building:**
   - A file where one side deleted it: no spots, so it stays a whole-file choice.
   - Binary or very large files: whole-file choice only.
   - Spots can shift after a fresh fetch; if the remote moved since the panel loaded,
     reload the spots instead of applying a stale choice.

### Tests (in `git-service.spec.js`)

- Two spots in one file, different sides: the written file has exactly the chosen lines.
- All spots "ours" gives the same bytes as whole-file "ours".
- A combination that makes the file unreadable is refused and the merge is rolled back.
- Stale spots (remote moved) are rejected, not silently applied.
- UI: choosing every spot enables Finish; choosing some does not.

**Estimate:** about a day, including tests.

---

## Phase 2 (later): Path B, combine and edit within a spot

Phase 1 picks a whole spot from one side. Path B goes one step further, for the case
where the right answer is *a mix of the lines inside a spot*.

- **Per-spot editor:** a text box pre-filled with Yours or Remote that the user can edit.
- **"Keep both" for list-like things only**, such as an extra header or an extra param,
  where having both is valid. **Not offered for single-value settings** like `url:`,
  `method:` or `timeout:`, because a request can't have two of them. Offering it there
  is how the round-5 bug happened.
- The same validation as Phase 1 runs on whatever the user writes, so a typo in the
  editor can't produce a request Bruno can't open.

**Build only if** Phase 1 turns out to be too coarse in real use. The signal is people
repeatedly opening VS Code just to combine lines. For big shared files like environment
files with many variables, or `opencollection.yml` with collection-level headers and
scripts, this is where it is most likely to matter. Start there.

**Estimate:** one to two days on top of Phase 1, mostly the editor UI and the
"which settings allow both" rules.

---

## What stays as it is

- **Path C (VS Code)** remains the escape hatch for anything these screens can't express.
- Whole-file choice (Path A) remains the default and the fastest route.
- Every path ends with the same check: Bruno must be able to read each merged file.
