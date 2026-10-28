# Start here

## One-time setup (5 minutes)
1. Put this whole `terrascan` folder somewhere on your laptop (keep the hidden `.claude` folder inside it).
2. Make sure you have: Python 3.12, Git, and Claude Code installed.
3. Open a terminal **inside** the `terrascan` folder and run `claude`.
4. Type `/next`. That's it. Claude starts Step 0.1.

## The loop (every step)
```
/next            → Claude shows a plan for the next step
"ok"             → Claude builds it, runs the checks, updates PROGRESS.md, commits
(you look at the "You check" list it gives you)
/clear           → wipe the conversation so the next step starts fresh
/next            → next step
```
Why `/clear` every time: long conversations are where Claude starts forgetting rules and making things up.
PROGRESS.md remembers everything that matters, so nothing is lost.

## The three commands
| Command | What it does |
|---|---|
| `/next` | Does the next step. `/next 2.3` jumps to a specific step (it warns you if earlier steps aren't done). |
| `/progress` | Shows where you are and what's waiting on you. Changes nothing. |
| `/review-step` | A fresh Claude that didn't write the code checks the last step and lists problems. Changes nothing. |

## When Claude stops and waits for you
Some steps have work only you can do (W&B login, creating the GitHub repo, labelling patches, pushing to
Hugging Face, writing your own analysis). Claude marks the step `waiting on you` and writes exactly what to do.
Do it, then type `/next`. It checks your work and moves on.

## Use `/review-step` after these steps
2.2c (SmallCNN experiments), 2.4b (satellite-pretrained model), 2.5 (comparison table), 4.1 (imagery pipeline), 4.3 and 4.4 (domain shift numbers), 4.7 and 4.8 (change study),
5.3 (website), 6.3 (README). These produce the numbers that go on your resume, so a second pair of eyes is worth it.
If it says **FAIL**, type: `fix the Must-fix items from the review`, then run `/review-step` again.

## Effort level (saves usage)
Run on **medium** by default. You don't need to remember which steps need more: `/next` checks the effort level
itself. On a high-effort step (2.2c, 2.4b, 2.5, 4.1, 4.7) it stops and tells you to type `/effort high` first, and at the
end of each step it tells you which effort the next step needs. Also switch to high yourself if something has failed
twice. `/review-step` always runs on high by itself.

## Rules for you
- **Read the plan before you say ok.** If you don't understand something in it, ask. That's how you learn the project.
- **Do every "You check" item.** Claude can be confidently wrong. You're the one who catches it.
- **Never type a number into the README yourself.** Numbers come from files in `results/`.
- **Don't say "do the next 5 steps".** One step per session is what keeps the quality high.

## If something goes wrong
- Claude went off track mid-step: press `Esc` to stop it, then tell it what's wrong.
- A step broke something: `/rewind` undoes Claude's recent edits in this session,
  or `git log` then `git revert <hash>` to undo a whole committed step.
- Claude seems confused about where you are: `/clear`, then `/progress`.
