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
5. Inspect handoff artifact metadata for `memoryCandidates`. Keep only candidates that are reusable across future work items and are supported by the accepted artifact or review evidence. If only some candidates should be persisted, include `approvedMemoryCandidateIndexes` in review `details`; if none should be persisted, include `approvedMemoryCandidateIndexes: []`; if a candidate needs rewritten wording, include a replacement `memoryCandidates` array in review `details`.
6. Resolve:
   - `APPROVED` when criteria are met.
   - `CHANGES_REQUESTED` when the worker can revise.
   - `REJECTED` when the handoff is unusable or materially off target.
7. A submitted approval updates the linked work item to `ACCEPTED`; requested changes move it to `NEEDS_REVISION`; rejection moves it to `REJECTED`.
8. On approval, the review API persists accepted `memoryCandidates` from the approved artifact as project memory and adds provenance such as `sourceArtifactId`, `workItemId`, and `reviewId`. Do not write routine task progress, temporary TODOs, raw logs, secrets, or download URLs to memory.

## Memory Candidate Review

Use the review API, not direct memory writes, for worker-proposed handoff memory candidates. This keeps project memory tied to the approved artifact and review.

Review `artifact.metadata.memoryCandidates` before approving:

```json
[
  {
    "memoryType": "CONSTRAINT",
    "title": "Shared file paths are project-relative",
    "content": "Project shared file paths must not use leading slash, .., or host filesystem paths.",
    "summary": "Keep shared file paths project-relative."
  }
]
```

Decision rules:

- If every candidate is durable, supported, and safe, omit `approvedMemoryCandidateIndexes`; the API will persist all valid artifact candidates on approval.
- If only some candidates should persist, set `details.approvedMemoryCandidateIndexes` to the zero-based candidate indexes to keep.
- If no candidate should persist, set `details.approvedMemoryCandidateIndexes` to an empty array.
- If a candidate is useful but needs corrected wording or metadata, set `details.memoryCandidates` to the exact replacement list. This replaces the artifact candidate list for persistence.
- Do not include secrets, raw logs, temporary URLs, task-local progress, guesses, or unsupported claims.

Use `project-memory-search` to check whether a candidate duplicates existing memory. Use `project-memory-write --work-item <workItemId>` only for explicit reviewer/owner/lead memory edits outside the handoff-candidate approval path; add `--pinned --priority critical --audience ...` only for durable role-targeted project directives.

```bash
# Search existing memory before approving a candidate.
. /opt/data/skills/agent-workspace/scripts/project-memory.sh
project-memory-search "shared file paths" CONSTRAINT 10

# The same helper can be run directly for one-off shell commands.
bash /opt/data/skills/agent-workspace/scripts/project-memory.sh search "shared file paths" CONSTRAINT 10
```

## Goal Slice And Aggregation Review

When reviewing work that belongs to a larger goal topology:

1. For slice, step, or revision items, verify the promised project shared files exist at `outputProjectFiles`, `outputContract.sharedFiles`, or the paths named in the handoff.
2. Check that the worker read required upstream `projectFiles` and disclosed missing, stale, conflicting, or partial data when source quality matters.
3. For aggregation, synthesis, delivery, or finalization items, verify every required upstream accepted artifact was read and cited or linked. Do not approve an aggregation that fills missing lanes from memory or unsupported assumptions.
4. Confirm the artifact satisfies the goal acceptance bar, includes required sections or outputs, preserves source links when relevant, and makes unresolved risks or missing evidence visible.
5. Request changes with concrete missing paths, unsupported claims, stale sources, absent risk notes, missing resource keys, or acceptance-contract gaps.
6. Approve memory candidates only when they are durable and supported by the accepted artifact or review evidence.

## Review Submission

Submit the review through the agent-workspace project review endpoint. Do not guess work-item-nested review routes.

```bash
. /opt/data/AGENT_WORKSPACE_RUNTIME.env
python3 - <<'PY'
import json, os, urllib.request

base = os.environ["AGENT_WORKSPACE_BASE_URL"]
token = os.environ["AGENT_WORKSPACE_TOKEN"]
project_id = os.environ["AGENT_WORKSPACE_PROJECT_ID"]

body_obj = {
    "assignmentId": "<assignmentId>",
    "artifactId": "<artifactId>",
    "decision": "APPROVED",
    "summary": "Specific review summary",
    "details": {
        "checks": [
            {"name": "acceptance criteria", "status": "pass", "note": "Criteria met with verified artifact."},
            {"name": "shared file evidence", "status": "pass", "note": "Required output path was read back successfully."}
        ],
        "approvedMemoryCandidateIndexes": [0]
    }
}
body = json.dumps(body_obj).encode()

req = urllib.request.Request(
    f"{base}/v1/projects/{project_id}/reviews",
    data=body,
    method="POST",
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
)
print(urllib.request.urlopen(req).read().decode())
PY
```

Use `decision: "APPROVED"`, `"REQUEST_CHANGES"`, or `"REJECTED"`. The workspace service stores the review on the work item, creates review events, moves requested changes to `NEEDS_REVISION`, and sends a rework inbox item to the original assignee when applicable.

When approving with rewritten memory candidates, replace `approvedMemoryCandidateIndexes` with:

```json
{
  "memoryCandidates": [
    {
      "memoryType": "FACT",
      "title": "Verified project file helper behavior",
      "content": "project-files.sh can be sourced for project-file-* functions or executed directly as bash project-files.sh <command>.",
      "summary": "project-files.sh supports source and direct CLI usage."
    }
  ]
}
```

The review API writes approved memory candidates only after `decision: "APPROVED"` and only when `artifactId` points to the accepted handoff artifact.

## Guardrails

- Do not approve based only on worker summary when artifacts are inspectable.
- Keep requested changes specific and actionable.
- Remember that repeated rejection can trigger a proposal; use rejection deliberately.
- Do not turn every completed item into memory. Prefer the work item, artifact, and goal as the source of truth for task-local progress.
