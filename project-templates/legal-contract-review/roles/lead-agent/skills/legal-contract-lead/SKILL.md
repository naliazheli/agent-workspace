# Legal Contract Lead

Use this skill when you are coordinating the `legal-contract-review` project template.

## Shared Folder Contract

- `source-contracts/` contains source contracts uploaded by the owner.
- `clause-reviews/` contains first-pass clause review files named `<source-name>-clause-review.md`.
- `risk-assessments/` contains risk assessment files named `<source-name>-risk-assessment.md`.
- `terms-maps/` contains obligation and deadline map files named `<source-name>-terms-map.md`.
- `compliance-checks/` contains optional compliance review files named `<source-name>-compliance-check.md`.
- `final-reports/` contains final owner-facing reports named `<source-name>-review-report.md`.
- `archive/` may contain completed source files after the owner decides to archive them.

These are project shared files. Use `project-file-list`, `project-file-read`, `project-file-write`, or the project files API. Do not treat `/opt/data/workspace` as a replacement for these folders.
Folder segments are fixed English identifiers. Source file names may remain in their original language, but do not create translated or Chinese folder aliases.

Owner uploads and chat attachments should be handled as project-relative shared file paths, usually under `source-contracts/`. Never preserve or repeat object-storage URLs, temporary download URLs, or runtime-local paths in work items, memories, owner messages, artifacts, or review records.

## Project Variables

Required legal-review owner context is stored as project globals:

- `business_context`
- `review_perspective`
- `legal_jurisdiction`

If the owner provides these non-sensitive values in chat, save them directly with the shared workspace helper instead of telling the owner to open project settings:

```bash
. /opt/data/skills/agent-workspace/scripts/project-memory.sh
project-global-write --plain --label "Business Context" --category legal business_context "<transaction background, contract value, relationship, and risk tolerance>"
project-global-write --plain --label "Review Perspective" --category legal review_perspective "<party perspective, such as customer side or vendor side>"
project-global-write --plain --label "Legal Jurisdiction" --category legal legal_jurisdiction "<jurisdiction or governing-law assumption>"
```

After writing variables, call `project-global-list` without `--include-values` or read the board to confirm they are configured, then continue the blocked planning/review topology. Do not store attorney-client privileged secrets, passwords, tokens, cookies, or private account identifiers from chat; use owner settings or resource-request items for sensitive values.

## Orchestration Rules

- On every wake, list `source-contracts/`, `clause-reviews/`, `risk-assessments/`, `terms-maps/`, `compliance-checks/`, and `final-reports/` with project-file-list.
- A contract is complete only when the matching final report exists in `final-reports/`.
- For each active goal, map every relevant source contract to the goal's linked work items and inspect those item statuses before creating more work. Accepted items count as complete only when their required shared output file exists at the exact path.
- Before creating work, check current work items and active assignments for the same source and stage.
- If a source file has no goal-scoped topology, create one READY `PLANNING` work item with the source file in `inputPacket.projectFiles` and `inputPacket.requiredGlobals` set to the exact keys `business_context`, `review_perspective`, and `legal_jurisdiction`; leave it unassigned for the COORDINATOR to dispatch to `PLANNER_AGENT`. Do not use display labels such as "Business Context" as required global identifiers.
- The preferred planner-created topology is:
  1. `LEGAL_CLAUSE_REVIEW` writes `clause-reviews/<source-name>-clause-review.md`.
  2. `LEGAL_RISK_REVIEW` depends on the clause item and writes `risk-assessments/<source-name>-risk-assessment.md`.
  3. `LEGAL_TERMS_REVIEW` depends on the clause item and writes `terms-maps/<source-name>-terms-map.md`.
  4. `LEGAL_COMPLIANCE_REVIEW` is optional and depends on the clause item. Create it only when jurisdiction, privacy, data, employment, consumer, regulated-industry, cross-border, enforceability, or owner context makes it relevant. It writes `compliance-checks/<source-name>-compliance-check.md`.
  5. `LEGAL_RECOMMENDATIONS` depends on every created specialist item and writes `final-reports/<source-name>-review-report.md`.
- If the planner is unavailable, stale, or blocked and work must continue, the lead may create the same topology directly. Do not write specialist outputs yourself when the coordinator path is available.
- Every worker item should include top-level `goalId` set to the current goal id, top-level `dependsOn`, `inputPacket.projectFiles`, `inputPacket.goalTopology`, `inputPacket.workSlice`, and `outputContract.sharedFiles` with exact project-relative paths. Downstream items may be `READY`; the coordinator will hold them until dependencies are accepted.
- Treat the template coordinator as the primary dispatcher. Use runtime-dispatch from the lead role only as a fallback when the coordinator is disabled, unavailable, stale, blocked, or has not produced an assignment and the project needs a new agent to keep moving. If you find an already-open assignment for the same source/stage, treat it as in flight instead of creating or dispatching another item.
- Tell reviewers the exact shared output path they must write, and require them to verify it before completing the assignment.
- After the final report exists, create or update a project artifact with `artifactType: REPORT`, an owner-readable title, and `metadata.projectFiles`/`metadata.resources` as arrays of objects like `[{"path":"final-reports/<source-name>-review-report.md"}]`. Use `artifactType`, not `type`, and do not send raw string arrays. The artifact is the durable delivery record that the owner/reviewer should see on the Delivery page.
- After the report artifact exists, create or update an owner decision item that links both the report path and the artifact id when available. The owner decision item should remain open until the owner or human reviewer accepts, requests changes, or rejects it.
- If all review-stage items are accepted but the final report or owner decision item is missing, create the missing item instead of marking the goal done.
- If every source contract covered by the goal has a verified final report and any required owner decision item is accepted, update the goal to `DONE` with a summary of the report paths. If any contract is still waiting on review output, owner decision, or missing source context, keep the goal `IN_PROGRESS` or `BLOCKED` and create the smallest next item that can advance it.

## Re-Review Requests

When the owner asks to review a contract again, prefer the work-item flow: mark the affected specialist or final-report item `NEEDS_REVISION`, or create a new planner/recommendations item that reuses the existing source and output paths. If the coordinator path is unavailable and the lead must repair the report directly, re-read the source file from `source-contracts/` and any existing specialist outputs from project shared files, update the final report at the same `final-reports/` path or write a clearly versioned replacement if the owner requests a separate copy, then refresh the `REPORT` artifact metadata so the Delivery page points at the current report. Record the direct-repair bypass in the owner summary.

## Idempotency

Use the source project file path plus stage as the durable key. Re-running the lead should advance missing stages, not duplicate completed or already active work.
