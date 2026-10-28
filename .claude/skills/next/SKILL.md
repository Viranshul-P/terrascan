---
name: next
description: Do the next TerraScan step from PROGRESS.md — plan it, wait for OK, build it, verify it, update PROGRESS.md and commit. Use only when the user types /next.
disable-model-invocation: true
argument-hint: "[optional step id, e.g. 2.3]"
---

# /next — do exactly one TerraScan step

Requested step (optional): $ARGUMENTS
Current effort level: ${CLAUDE_EFFORT}

Follow these phases in order. Do not skip any. Talk to the user in plain, simple English.

## 1. Load context
Read `CLAUDE.md`, `PROGRESS.md`, and `PLAN.md`. Read `SPEC.md` only for the phase this step belongs to.

## 2. Pre-flight checks (stop and tell the user if any fails)
- **Which step:** use the step id the user gave above if any; otherwise use "Current step" in PROGRESS.md.
  If the user picked a step whose earlier steps aren't ticked, warn them and ask before continuing.
- **Status = waiting on you:** show the "Waiting on you" text and ask whether they've done it.
  - If yes: check what can be checked (e.g. the labels CSV exists and how many rows it has, `wandb` is logged in,
    the HF repo URL they give you). Report what you found. If the step says Claude does more work after the
    user's part (e.g. 5.3: fix the top 3 usability problems), plan that work, wait for OK, do it and verify it.
    Then tick the step, update PROGRESS.md (next step, status `not started`, clear "Waiting on you"), commit,
    and STOP. Tell them to `/clear` then `/next`.
  - If no: remind them what to do and STOP.
- **Status = in progress:** a previous session stopped mid-step. Look at `git status` and the files that exist,
  tell the user what's already there, and plan only the remaining work.
- **Effort check:** if the step's entry in PLAN.md has **Effort: high** and the current effort level above is
  `low` or `medium`, STOP before planning and say exactly:
  "Step X.Y is a high-effort step. Type `/effort high` (press `s` to apply it to this session only), then type `/next` again."
  If the effort level above is shown as a literal placeholder instead of a word, just tell the user this step
  should run on high effort and ask whether they've switched.
- **Git:** if this isn't a git repo yet and the step is 0.1, `git init` is part of the step.
  Otherwise, if there are uncommitted changes that don't belong to an in-progress step, show them and ask what to do.

## 3. Plan, then wait
Show a short plan (aim for under 15 lines):
- Step id and title
- What you'll build, and which files you'll create or change
- How you'll prove it's done (the step's **Done when** checks, plus `pytest` and `ruff check .`)
- Any decision the user must make first (e.g. image size in 2.3) — give your recommendation and why
- Any **You do** part and roughly when you'll hand it over
- Anything that will take long (downloads, full training runs) with a rough time estimate

Then STOP and wait for the user to say OK. Don't write code before that.

## 4. Build
- Set Status to `in progress` in PROGRESS.md first.
- Work in small pieces. Run the relevant test after each piece instead of writing everything and testing at the end.
- Training: run `--fast-dev-run` first. Before a full run, tell the user the command and expected time and ask
  whether to start it now.
- If something fails twice in a row, stop and explain what's going wrong instead of trying random fixes.
- Check library APIs against the installed version before using them. Never invent URLs or functions.

## 5. Verify (show real output, not a summary of what "should" happen)
- Run every **Done when** check for this step.
- Run `ruff check .` and `pytest`.
- Self-check before committing:
  - Every number you wrote anywhere came from a file in `results/` or `models/`, and you named that file.
  - No data, weights, imagery, `.env` or API keys are staged (`git status`).
  - The code does only what the step asked. Remove anything extra.
- If any check fails, fix it or tell the user. Never mark a failing step done.

## 6. Hand-off for "You do" parts
Never do the user's "You do" work for them, even if asked mid-step. The user is a beginner (currently learning ML
basics, not neural networks yet). When explaining, assume no ML knowledge: short, plain words, one idea at a time,
small text diagrams.

If the step has a **You do** part: finish your part, commit it, set Status to `waiting on you`, write the exact
instructions in "Waiting on you" (what to do, where, and what file or result you'll check next time), and STOP.

## 7. Record and commit
Update PROGRESS.md:
- Tick the step in **Steps**.
- Add one line to **Log**: `- X.Y — <what was done in a few words>`.
- Add any **Decisions made**, **Known issues**, and **Results so far** (with source file names).
- Set **Current step** to the next step id, **Status** to `not started`, "Waiting on you" to `(nothing)`.

Commit only the files for this step (`git add <paths>`, not `git add -A` blindly), message `stepX.Y: <short summary>`.

## 8. Finish
End with a short message:
1. What was built (2–4 lines).
2. The step's **You check** items, as a checklist for the user.
3. One question the user should be able to answer about this step in an interview (don't answer it unless asked).
4. If the step was 2.2b, 2.2c, 2.4b, 2.5, 4.1, 4.3, 4.4, 4.7, 4.8, 5.3 or 6.3: recommend running `/review-step` before moving on.
5. Effort for the next step, from PLAN.md:
   - next step has **Effort: high** → "Next: type `/clear`, then `/effort high`, then `/next`."
   - otherwise, if the current effort is `high` → "Next: type `/clear`, then `/effort medium` (saves usage), then `/next`."
   - otherwise → "Next: type `/clear`, then `/next`."

Do NOT start the next step.
