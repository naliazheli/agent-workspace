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
- Before creating work, check current work items and active assignments for the same source and stage.
- For missing first-pass review, create one work item for `LEGAL_CLAUSE_AGENT` with the source file in `inputPacket.projectFiles`.
- For missing second-pass review, create one work item for `LEGAL_RECOMMENDATIONS_AGENT` with both the source file and the first-pass file in `inputPacket.projectFiles`.
- Tell reviewers the exact shared output path they must write, and require them to verify it before completing the assignment.
- After the final report exists, create or update an owner decision item that links the report path.

## Idempotency

Use the source project file path plus stage as the durable key. Re-running the lead should advance missing stages, not duplicate completed or already active work.
