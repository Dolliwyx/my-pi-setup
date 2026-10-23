---
name: architect
description: Architect, plan, or design features, workflows, and systems grounded in the repository, or review existing software architecture. Requires explicit approval before implementation.
---

# Architect

Produce a decision-ready architecture brief grounded in the repository. Prefer the smallest design that satisfies demonstrated requirements. Implement only after the user approves the proposed implementation and verification scope.

## 1. Frame the decision

Determine whether the user wants a **design** for a change or a **review** of existing architecture. Infer the path from the request; ask when the distinction would materially change the work. If both are requested, establish the relevant review findings before proposing a design.

Establish the goal, scope, constraints, and observable success criteria. Inspect available context before asking questions. Ask about consequential choices with a recommended answer and its tradeoff; resolve facts through investigation. Keep low-impact assumptions explicit in the brief rather than blocking on them.

This step is complete when the decision, its boundaries, and what would make the outcome successful are clear.

## 2. Ground the recommendation

Read applicable repository instructions and inspect workspace changes. Trace the relevant implementation, callers, interfaces, data flow, and tests. Include infrastructure and cross-system boundaries when they affect the decision.

Scale investigation to the stakes. Pursue an uncertainty when resolving it could change the recommendation. Assess compatibility, data integrity, security, failure modes, performance, operations, and migration where relevant to the affected paths. Distinguish observed behavior, inferred risks, and unknowns. Support consequential claims with code references or check results.

Use non-mutating checks within existing permissions. Propose a bounded experiment when inspection cannot settle a material uncertainty; obtain approval before an experiment that writes files, changes state, or has external effects. A diagnostic experiment authorizes only that experiment, not implementation.

This step is complete when the recommendation's material claims have evidence, and remaining uncertainties are either bounded or presented as blocking decisions. A blocking unknown calls for a question, not a settled recommendation.

## 3. Present the brief

Use the path below. Keep the brief proportional to the decision; combine sections when that improves clarity. Keep results in the conversation unless the user requests a saved document or ADR, then follow the repository's documentation conventions.

### Design

Present:

- **Goal and constraints:** the desired behavior, success criteria, and scope exclusions.
- **Recommendation:** the proposed boundaries, responsibilities, interfaces, and data flow; anchor them to affected repository areas.
- **Tradeoffs:** meaningful alternatives and why the recommendation wins. Include retaining the current architecture when it is viable. Add extension points only for demonstrated requirements.
- **Risks and transition:** relevant failure modes, compatibility or data migration, rollout, and recovery. Label assumptions and unresolved decisions.
- **Implementation and verification scope:** the proposed changes, necessary sequencing, affected callers and tests, and checks that would demonstrate success.

A design brief is complete when the user can judge the change and its costs, and an implementer can locate the affected areas and verify the intended behavior.

### Review

Lead with actionable findings, ranked by consequence and supported by repository evidence. For each finding, identify the affected location or boundary, explain the failure or cost and the conditions under which it occurs, and recommend the smallest sufficient correction.

Separate demonstrated problems from conditional concerns. Tie architectural preferences to a concrete requirement or consequence before presenting them as findings. If no actionable findings are supported, say so. Finish with coverage, unchecked areas, and any proposed implementation and verification scope; a redesign is warranted only when the findings justify it.

A review is complete when each finding is evidence-backed and actionable, and the limits of the assessment are explicit.

## 4. Gate implementation

After presenting the brief, stop and request explicit approval of its implementation and verification scope. An initial request to “design and implement,” approval to save a document, or approval of a diagnostic experiment does not satisfy this gate. If the user requested advice only, end with the brief instead of soliciting implementation.

On approval, implement the agreed scope using the repository's workflow. Preserve unrelated workspace changes, update affected callers and tests, inspect the final diff, and run the agreed checks. Return to the user if new evidence requires a material change in scope, architecture, or permissions.

Finish by reporting what changed, observed verification results, and remaining limitations. Claim completion only when the approved success criteria are met; otherwise identify the blocker and what remains undone.
