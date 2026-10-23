---
name: create-pr-mr
description: Prepare and create pull requests or merge requests with clear change summaries, affected files, and correct target branches. Use when the user asks to create, open, draft, update, or prepare a PR, pull request, MR, or merge request.
---

# Create PR or MR

## Scope

Resolve the intended operation from the request and conversation. Preparing title/body text is local work and does not authorize a push or publication. Opening a PR/MR, including a published draft, authorizes the necessary branch push and creation within the requested scope; updating one authorizes the requested update. Do not add another approval gate when that scope is already clear.

## Flow

1. Inspect: `git status --short`, `git branch --show-current`, `git remote -v`, recent commits.
2. Detect host CLI:
   - GitHub: `gh pr create --help`
   - GitLab: `glab mr create --help`
   - Missing/unknown: draft title/body and say what could not run.
3. Resolve the source branch and remote, destination repository, and base branch from the request, branch tracking, and host metadata. Ask only if ambiguity would change the destination or scope.
4. Check for a matching open PR/MR in the destination repository.
5. Prepare concise title/body text. Return it without pushing or publishing for preparation-only requests.
6. For an authorized remote operation, push only if needed, then create or update the PR/MR. Verify its URL and branch targets before reporting completion.

## Checks

- Inspect existing requests with the host CLI, checking state, source repository/branch, and destination repository/base branch. Scope queries to the resolved repository.
- Reuse a matching open request: update it only when authorized, otherwise report it. A closed or merged request does not by itself prevent a new one.
- Inspect ready commits and the proposed diff against the resolved base reference: `git log --oneline "$base_ref"..HEAD` and `git diff "$base_ref"...HEAD`.
- Resolve a missing base from host metadata and repository conventions rather than assuming `main` or the default branch is the intended target.

## Branch

- Use the current branch unless the user named another. Before using the `HEAD`-based commands below, ensure the checkout matches the resolved source branch without disturbing unrelated work; otherwise use explicit branch references.
- Avoid PRs/MRs from protected default branches.
- Push to the resolved source remote and branch: `git push -u "$source_remote" "HEAD:refs/heads/$source_branch"`. Here `source_remote` is the configured remote name or URL and `source_branch` is the authorized branch name; neither is a literal placeholder.
- If network/auth blocks publication, continue preparing useful local title/body text and report the exact blocker. Use the established authentication workflow; do not bypass access controls. Never invent a URL.

## Body

Follow explicit user requirements and applicable repository templates within the instruction hierarchy. Otherwise use this default:

```md
## Summary
Briefly state what this PR/MR is for in 1-2 sentences.

## Changes
- ...
- ...

## Files affected
- `path/to/file`: ...
- `path/to/other`: ...
```

Add screenshots/links only when real.

Content:

- Title fits change; Conventional Commit style is fine.
- Summary = short purpose/context before the change list.
- Changes = behavior changed.
- Files affected = concise list of touched files or directories and why they changed.
- By default, omit `Tests`, `Verification`, and test-run notes from the PR/MR body. Include them when the user or an applicable repository template requires them.
- Bug fix: problem and corrected behavior.
- UI: screenshots only when captured.
- Migration/ops: rollout and rollback notes only if directly part of the change.
- Risks/follow-ups only when useful and directly tied to affected files.

## GitHub

- Create: `gh pr create --repo "$destination_repo" --base "$base_branch" --head "$head_spec" --title "$title" --body "$body"`.
- Set the variables from the resolved request. `head_spec` identifies the source branch, including its owner for a fork when required by the CLI.
- Draft: add `--draft` when user asks or work is not review-ready.
- Useful: `gh pr checks`, `gh pr edit --title "..." --body "..."`, `gh pr view --web`.

## GitLab

- Create: `glab mr create --repo "$source_repo" --target-branch "$base_branch" --source-branch "$source_branch" --title "$title" --description "$body"`.
- Set the variables from the resolved request. For a cross-project MR, confirm the installed CLI's target-repository option with `glab mr create --help` and supply the resolved destination explicitly.
- Draft/WIP when user asks or work is not review-ready.
- Useful: `glab mr view`, `glab mr update --title "..." --description "..."`.

## Hygiene

- State URL after creation.
- Say if unrelated local changes remain.
- No force-push, public-branch rebase, or retarget unless user asked.
- Factual title/body. No marketing gloss.
