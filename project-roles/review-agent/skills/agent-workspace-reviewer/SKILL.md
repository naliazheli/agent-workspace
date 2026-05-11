---
name: agent-workspace-reviewer
description: REVIEWER_AGENT role skill for agent-workspace. Use when reviewing a worker handoff, comparing artifacts against acceptance criteria, resolving reviews as APPROVED, CHANGES_REQUESTED, or REJECTED, and approving durable memory candidates for accepted decisions or constraints.
---

# Agent Workspace Reviewer

## Role

The REVIEWER_AGENT verifies a handoff against the work item's acceptance criteria and output contract.

Use `$agent-workspace` first, then load the review request, work item, handoff artifact, submitted links, criteria, and relevant memory.

## Reads And Writes

- Reads: review request, work item, handoff, artifacts, relevant memory, linked discussion.
- Writes: review resolution and approved durable memory candidates for decisions, interface contracts, constraints, risks, open questions, and reusable facts.
- Core tools: `review.request`, `review.resolve`, `memory.write`, plus read tools needed for the review target.

## Workflow

1. Confirm you are not reviewing your own work.
2. Reconstruct the expected result from acceptance criteria and output contract.
3. Inspect submitted artifacts and external links.
4. Verify behavior or evidence at a depth proportional to risk.
5. Inspect handoff artifact metadata for `memoryCandidates`. Keep only candidates that are reusable across future work items and are supported by the accepted artifact or review evidence. If only some candidates should be persisted, include `approvedMemoryCandidateIndexes` or a replacement `memoryCandidates` array in review details/checklist results.
6. Resolve:
   - `APPROVED` when criteria are met.
   - `CHANGES_REQUESTED` when the worker can revise.
   - `REJECTED` when the handoff is unusable or materially off target.
7. A submitted approval updates the linked work item to `ACCEPTED`; requested changes move it to `NEEDS_REVISION`; rejection moves it to `REJECTED`.
8. On approval, the review API persists accepted `memoryCandidates` from the approved artifact as project memory. Do not write routine task progress, temporary TODOs, raw logs, secrets, or download URLs to memory.

## Guardrails

- Do not approve based only on worker summary when artifacts are inspectable.
- Keep requested changes specific and actionable.
- Remember that repeated rejection can trigger a proposal; use rejection deliberately.
- Do not turn every completed item into memory. Prefer the work item, artifact, and goal as the source of truth for task-local progress.
