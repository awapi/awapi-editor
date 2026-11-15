---
name: gitpush
description: "Commit all current changes with a meaningful Conventional Commits message and push them to GitHub. Use only when the user runs /gitpush or explicitly asks to commit and push."
argument-hint: "[optional hint for the commit message]"
disable-model-invocation: true
---

# `/gitpush` — Commit and Push

Running `/gitpush` **is** the user's explicit request to stage, commit, and push (see the Git Operations rule in `AGENTS.md`). Follow these steps in order and stop with a clear explanation if any step fails.

## 1. Inspect the Changes
1. `git status --porcelain` — if there is nothing to commit and the branch is not ahead of its upstream, report that and stop.
2. Note the current branch (`git branch --show-current`). If it is detached HEAD, stop and ask the user.
3. Read the changes so the message describes them accurately:
   ```bash
   git --no-pager diff --stat HEAD
   git --no-pager diff HEAD
   git ls-files --others --exclude-standard   # new, untracked files
   ```
4. Exclude things that must not be committed: secrets (`.env*`, keys, tokens), build output (`dist/`, `release/`), and scratch or log files (for example `out.txt`, `test_output.txt`, `*.log`). If you're unsure whether a file belongs, ask the user. Never add secrets.

## 2. Verify
Run `pnpm run typecheck` and `pnpm run test`. If either fails, stop and report the failure; don't commit unless the user says to commit anyway.

## 3. Write the Commit Message
Follow the repository's Conventional Commits style (see `git --no-pager log --oneline -15`):

```
<type>(<optional scope>): <imperative summary, lowercase, no period, ≤ 72 chars>

- <what changed and why, one bullet per meaningful change>
- <mention user-visible behavior changes and any new commands/scripts>
```

- **type:** `feat` (user-facing feature), `fix` (bug fix), `refactor`, `test`, `docs`, `chore` (tooling/build/release), `perf`, `style`, `ci`.
- **scope (optional):** area such as `preview`, `explorer`, `terminal`, `release`.
- Summarize the *intent* of the change, not the file list. If the changes are unrelated, describe each in the body and choose the type of the most significant one.
- If the user passed a hint after `/gitpush`, use it to guide the summary.
- Don't use `chore: release vX.Y.Z`; that message is reserved for `/release`.

## 4. Commit and Push
1. Stage the reviewed files (`git add -A` when everything belongs, otherwise `git add <paths>`).
2. Commit with separate `-m` flags so the body is kept:
   ```bash
   git commit -m "<summary>" -m "<body>"
   ```
3. Push:
   - If the branch has an upstream: `git push`.
   - If not: `git push -u origin HEAD`.
   - If the push is rejected because the remote has new commits: `git pull --rebase`, then `git push`. If the rebase hits conflicts, stop and ask the user. **Never force-push.**

## 5. Report
Show the branch, the short commit hash, and the full commit message, and confirm the push succeeded.
