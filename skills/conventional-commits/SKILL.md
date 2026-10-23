---
name: conventional-commits
description: Create git commits using Conventional Commits with scoped, reviewable changes. Use when the user asks to commit changes, make a conventional commit, write a commit message, or prepare staged changes for commit.
---

# Conventional Commits

## Commit Boundaries

Resolve the authorized operation from the request and applicable repository workflow:

- Message only: inspect the relevant changes and return the message without staging or committing.
- Staging only: stage the requested changes and report the staged scope without committing.
- Commit: stage and commit only the authorized changes.

Default to one commit per coherent concern, including for requests such as “commit the changes.” Group by purpose, not file or commit type: keep a feature or fix with its supporting tests, docs, and required configuration; separate independent fixes, features, refactors, and maintenance. Each commit must be reviewable and verifiable on its own. Use one commit when all authorized changes serve one concern, or when the user explicitly requests a single commit.

## Flow

1. Inspect: `git status --short`, `git diff --stat`, `git diff`, `git diff --staged`.
2. Identify the authorized files and hunks, including changes already staged. For commit requests, present an ordered commit plan with a purpose and scope for each group. Every authorized change must belong to exactly one group; order prerequisites first.
3. For message-only requests, return the complete message without mutation. For staging-only requests, stage the authorized scope, verify the staged diff, and stop.
4. For each planned commit, stage only that group's files or hunks. Compare the entire staged diff with the group's scope; proceed only when they match, including any previously staged changes.
5. Write `type(scope): summary`, with a short body when useful to explain what changed and why, then commit non-interactively: `git commit -m "type(scope): summary" -m "Description."`.
6. Verify the resulting commit's files and diff, then repeat steps 4–6 for the next group.
7. Report each commit's hash and purpose, plus any remaining changes.

Use the second `-m` paragraph whenever there is enough useful context. Skip it only for trivial commits where the summary fully explains the change.

## Message

Format: `type(scope): summary`

Types, lowercase:

- `feat`: new user/product capability
- `fix`: bug fix
- `docs`: docs only
- `style`: formatting only
- `refactor`: restructure, no behavior change
- `perf`: speed/resource improvement
- `test`: tests only
- `build`: build/deps/package changes
- `ci`: CI config
- `chore`: maintenance
- `revert`: undo a commit

Scope when useful: `api`, `ui`, `auth`, `deps`, `docs`, package name. Skip vague scopes.

Summary: imperative, specific, about 72 chars or less, no ending punctuation.

Good:

- `feat(auth): add passkey registration`
- `fix(api): reject expired invite tokens`
- `docs: document local setup`

## Safety

- Leave unrelated user changes alone.
- If related and unrelated edits share a file, inspect and stage hunks only.
- Account for unrelated changes already staged: ordinary `git commit` includes the entire index, not just the files most recently added. Preserve unrelated staged and unstaged work. If safely separating the requested commit requires a decision about that work, ask before changing its staging or committing.
- No destructive git commands unless user explicitly asked.
- If hooks change files, inspect the new diff before retrying.

## Staging

- Clean related files: `git add path/to/file`.
- Files spanning concerns or containing unrelated edits: `git add -p path/to/file` to stage only the current group's hunks.
- Verify staged work: `git diff --staged --stat`, then `git diff --staged`.

## Body / Description

Prefer a short body after the summary when it adds useful context. Describe what changed and why; avoid restating the summary.

```sh
git commit \
  -m "fix(cache): prevent stale workspace reads" \
  -m "Invalidate cached workspace metadata when the selected account changes."
```

## Breaking Changes

Use `!` plus footer only when callers, users, stored data, or deploy expectations must change:

```text
feat(api)!: rename token exchange endpoint

BREAKING CHANGE: /token/exchange is replaced by /oauth/token.
```
