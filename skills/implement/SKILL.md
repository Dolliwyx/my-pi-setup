---
name: implement
description: Execute the session's existing plan by delegating independent work to leaf subagents, integrating changes, and verifying the result.
disable-model-invocation: true
---

# Implement

The session supplies the plan. The coordinator turns it into assignments, delegates independent work, and owns integration and acceptance. Workers execute bounded assignments directly.

## 1. Recover the plan

Extract the agreed outcome, decisions, constraints, and acceptance criteria from the conversation and any referenced plan. Inspect relevant repository instructions, source, and working-tree changes to ground the assignments and preserve existing work.

Keep established decisions intact. Resolve uncertainties from available evidence; ask only when missing information materially affects correctness, scope, or safe execution. If no actionable plan exists, ask for it rather than inventing one.

**Ready:** the existing plan is identified, its acceptance criteria are checkable, and blocking ambiguities are resolved.

## 2. Assign ownership

Create a tracked work list covering every remaining plan requirement. Each assignment needs a concrete outcome, relevant inputs, dependencies, owned files, and an acceptance check. Keep completed work complete.

Use the fewest workers that provide useful parallelism. Delegate separable units; retain tightly coupled changes and shared-file integration in the coordinator. Concurrent writers must own disjoint files or use supported isolated checkouts. Resolve shared interfaces before dispatch, and release dependent work only after its inputs are accepted.

If no useful independent split exists, execute directly and briefly explain why.

**Ready:** every remaining requirement has an owner and check, and concurrent assignments cannot overwrite each other's work.

## 3. Dispatch leaf workers

Use the environment's authorized subagent mechanism. Before launching, verify that each worker's effective tool allowlist permits only reading/searching and, for editing assignments, file edits. Exclude delegation, workflow, process execution, gateways, scripting, and tool-enabling capabilities: shell access can launch agents even when delegation tools are hidden. A prompt prohibition alone is insufficient.

If the tool boundary cannot be enforced, report that limitation and perform the affected work in the coordinator. Keep tests, builds, and other commands in the coordinator; tool restrictions constrain callable tools, not an OS sandbox.

Give every worker a self-contained brief containing:

- The overall objective and relevant established decisions.
- Its exact outcome, inputs, owned files, dependencies, and scope boundaries.
- Acceptance criteria and any tests it should add or update.
- A return contract: changed files, completed criteria, checks actually performed, proposed verification commands, and remaining blockers.
- This mandatory instruction:

> Execute your assignment directly and preserve unrelated changes. Only the coordinator may delegate. Do not create subagents, launch agent workflows, or assign work to other agents through any mechanism. Keep your tool restrictions unchanged. Return blockers, ownership conflicts, and requests for additional workers to the coordinator.

Launch ready independent assignments concurrently within supported limits. Track their states using the harness's completion mechanism. While they run, work only on coordinator-owned tasks.

**Dispatched:** each launched worker has a bounded brief and verified leaf-only tools.

## 4. Integrate and verify

Account for every assignment as completed, partial, failed, or blocked. Inspect actual changes against the brief and repository conventions; worker summaries alone are not acceptance evidence. Resolve conflicts while preserving unrelated edits. Narrow and retry incomplete assignments or finish them directly within scope.

Review proposed commands before running them. Run relevant tests and repository-required checks on the integrated result, including cross-assignment behavior. Review the combined diff against every acceptance criterion from the original plan. Repair in-scope failures and repeat affected checks.

**Complete:** every plan requirement is supported by inspected changes and verification evidence, with no unresolved in-scope failures. Otherwise report partial completion and the specific blockers.

Return a concise outcome, changed files, checks actually run, and any remaining uncertainty rather than concatenated worker reports.
