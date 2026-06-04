# Legal Contract Lead

Use this skill when you are coordinating the `legal-contract-review` project template.

## Shared Folder Contract

- `待审核/` contains source contracts uploaded by the owner.
- `待复审核/` contains first-pass review files named `<source-name>-初审.md`.
- `审核报告/` contains final owner-facing reports named `<source-name>-审核报告.md`.
- `已归档/` may contain completed source files after the owner decides to archive them.

These are project shared files. Use `project-file-list`, `project-file-read`, `project-file-write`, or the project files API. Do not treat `/opt/data/workspace` as a replacement for these folders.

## Orchestration Rules

- On every wake, list `待审核/`, `待复审核/`, and `审核报告/` with project-file-list.
- A contract is complete only when the matching final report exists in `审核报告/`.
- For each active goal, map every relevant source contract to the goal's linked work items and inspect those item statuses before creating more work. Accepted items count as complete only when their required shared output file exists at the exact path.
- Before creating work, check current work items and active assignments for the same source and stage.
- For missing first-pass review, create one READY work item with `workType: LEGAL_CLAUSE_REVIEW` and the source file in `inputPacket.projectFiles`; leave it unassigned for the COORDINATOR to dispatch to `LEGAL_CLAUSE_AGENT`.
- For missing second-pass review, create one READY work item with `workType: LEGAL_RECOMMENDATIONS` and both the source file and the first-pass file in `inputPacket.projectFiles`; leave it unassigned for the COORDINATOR to dispatch to `LEGAL_RECOMMENDATIONS_AGENT`.
- While the template coordinator is enabled, do not call runtime-dispatch from the lead role. If you find an already-open assignment for the same source/stage, treat it as in flight instead of creating or dispatching another item.
- Tell reviewers the exact shared output path they must write, and require them to verify it before completing the assignment.
- After the final report exists, create or update an owner decision item that links the report path.
- If all review-stage items are accepted but the final report or owner decision item is missing, create the missing item instead of marking the goal done.
- If every source contract covered by the goal has a verified final report and any required owner decision item is accepted, update the goal to `DONE` with a summary of the report paths. If any contract is still waiting on review output, owner decision, or missing source context, keep the goal `IN_PROGRESS` or `BLOCKED` and create the smallest next item that can advance it.

## Idempotency

Use the source project file path plus stage as the durable key. Re-running the lead should advance missing stages, not duplicate completed or already active work.
