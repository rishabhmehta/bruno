# Bug: resolving a conflict deleted a file

**Date:** 31 Oct 2026
**Status:** Fixed (not yet committed at the time of writing)
**Where:** `packages/bruno-electron/src/git/git-service.js`, `takeSide()`
**Test that guards it:** `packages/bruno-electron/src/git/git-service.spec.js`, the `takeSide` tests

---

## What you saw

You pulled, got a conflict on three files (`Posts.yml`, `posts-2.yml`, `Users-r1.yml`),
picked **Yours** for each, and clicked **Finish merge**.

Afterwards `posts-2.yml` was **gone**: from your folder, from the merge commit, and
(after Push) from GitHub. Neither you nor your teammate had deleted it. Both of you had
only edited it.

---

## How "Finish merge" works

When you pick a version for each conflicting file, Bruno:

1. Starts the merge again.
2. For every conflicting file, puts the version you picked in place:
   - "Yours" → `git checkout --ours <file>`
   - "Remote" → `git checkout --theirs <file>`
   - then `git add <file>` to tell git "this one is resolved".
3. Commits the merge.

Step 2 is a small function called `takeSide`.

---

## The bug: "if anything goes wrong, delete the file"

There is one legitimate reason step 2 can't check out a version: **that side deleted
the file.** Example: your teammate deleted `Users.yml` while you edited it. If you pick
"Remote", there is no remote version to put in place. The right result is that the
file is deleted.

The old code handled that case like this:

```js
try {
  await git.raw(['checkout', `--${side}`, '--', file]);
  await git.add(file);
} catch (error) {
  // assumed: "it failed, so that side must have deleted the file"
  await git.raw(['rm', '--quiet', '--', file]);
}
```

It **guessed**. *Any* error was treated as "that side deleted it", and the file was
removed. A failure for a completely unrelated reason (a busy git, a timing clash) quietly
turned into "delete this request". No error was shown, the merge commit simply didn't
contain the file, and Push sent that to everyone.

That's the real bug, and it is certain. It is the only code that could have removed
the file from the merge commit.

---

## What probably caused the error

Not proven, but the most likely trigger:

- Bruno watches your collection folder. Every time a file changes, it runs `git status`
  to update the badge and the panel.
- `takeSide` changes files (the checkout), so the watcher immediately runs `git status`.
- `git status` briefly **locks** git's index file (`.git/index.lock`). Only one git
  command can change the index at a time.
- If `git add` ran in that moment, it failed with *"index.lock: File exists"*, and the
  old code then deleted the file.

The timing window is tiny, which is why it happened once and not every time. I could
not reproduce it on demand. But it doesn't matter which error it was: the fix below
removes the guess, so **no** error can turn into a deletion any more.

---

## The fix

Three changes, from most to least important:

### 1. Never guess. Ask git whether that side has the file

During a conflict, git keeps both versions of the file in its index, labelled
*stage 2* (yours) and *stage 3* (remote). If a side deleted the file, its stage is
missing. `takeSide` now looks before acting:

```js
const unmergedEntries = await git.raw(['ls-files', '--unmerged', '--', file]);
const sideHasFile = /* is there a stage 2 (ours) / stage 3 (theirs) entry? */;

if (!sideHasFile) {
  await git.raw(['rm', '--quiet', '--', file]);   // the only path that deletes
  return;
}

await git.raw(['checkout', `--${side}`, '--', file]);
await git.add(file);                              // errors are NOT caught here
```

Any other error now goes up to `resolveConflicts`, which **cancels the whole merge**
and shows the error. Your files stay exactly as they were, and you can try again.

### 2. Bruno's own `git status` no longer locks anything

Every git command Bruno runs now has `GIT_OPTIONAL_LOCKS=0` set. With it, read-only
commands like `git status` skip the lock entirely. The watcher can't block a merge
any more.

### 3. Wait and retry when something else holds the lock

Other tools can still lock the repo for a moment, like VS Code's git integration or
a terminal. Commands that change the index now retry up to 5 times with a short pause
before giving up. If they still give up, the merge is cancelled cleanly, as in fix 1.

---

## How we know it's fixed

- **Deterministic regression test** (`takeSide` in `git-service.spec.js`): makes
  `checkout` fail with a random error and checks the file is **not** deleted and the
  error is reported. A second test checks a file *is* deleted when the chosen side
  really deleted it. Both tests were run against the old code and **failed**, so they
  catch exactly this bug.
- **Concurrency tests**: resolve a conflict while `git status` runs in a tight loop,
  both the way Bruno's watcher does it and with real locking like another tool. No
  file is lost and no merge is left half-done.
- **Your round 2 test**, same scenario, picked **Yours** for everything:
  `posts-2.yml` survived.

---

## Data recovery

`posts-2.yml` was restored from your round-1 commit (your "Yours" version,
"Post by id") and pushed in commit `9ceae98`, "Restore posts-2.yml dropped by a git sync
merge bug".

## Lesson

A `catch` that does something destructive is a bug waiting for an unexpected error.
When failure has an innocent meaning and a destructive one, check which one it is
first. Don't infer it from the fact that something failed.
