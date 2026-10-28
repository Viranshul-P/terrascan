---
name: progress
description: Show where the TerraScan project stands — current step, status, what's waiting on the user, and what's next. Read-only. Use only when the user types /progress.
disable-model-invocation: true
allowed-tools: Read Bash(git log *) Bash(git status *)
---

# /progress — where are we?

Read `PROGRESS.md` and `PLAN.md`, and run `git status --short` and `git log --oneline -5`.
Do not change any file.

Reply in this shape, short and plain:

- **Done:** N of 32 steps (current phase name)
- **Current step:** X.Y — title — status
- **Waiting on you:** the text from PROGRESS.md, or "nothing"
- **Last 3 steps finished:** from the Log
- **Next step in one line:** what X.Y will build, from PLAN.md
- **Heads-up:** only if something looks off — uncommitted changes, a step marked done with no matching
  commit, or open items under "Known issues"

Then tell the user what to type next (usually `/next`).
