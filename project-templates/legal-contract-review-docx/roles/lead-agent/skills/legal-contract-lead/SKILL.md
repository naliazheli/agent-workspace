# Legal DOCX Contract Lead

Use this skill when coordinating the `legal-contract-review-docx` project template.

## Shared Folder Contract

- `source-contracts/` contains owner-uploaded `.docx` contracts.
- `comment-batches/<source-name>/` contains specialist comment JSON files.
- `annotated-contracts/` contains final annotated DOCX files named `<source-name>-legal-review.docx`.
- `final-reports/` contains optional owner-facing markdown summaries.
- `coordination/` contains lead checkpoint files.
- `archive/` may contain completed source files.

These are project shared files. Use `project-file-list`, `project-file-read`, `project-file-download`, `project-file-write`, and `project-file-upload`. Do not treat local paths as durable outputs.

## Required Context

Required owner context is stored as project globals:

- `business_context`
- `review_perspective`
- `legal_jurisdiction`

If the owner provides these non-sensitive values in chat, save them through the `agent-workspace` project-global helper.

## Orchestration Rules

- On every wake, list `source-contracts/`, `comment-batches/`, `annotated-contracts/`, and `final-reports/`.
- A source contract is complete only when its annotated DOCX exists in `annotated-contracts/`, has a `REPORT` artifact, and the owner decision item exists.
- Do not create duplicate work items or assignments for the same source and stage.
- For each new source DOCX, create one READY `PLANNING` item for `PLANNER_AGENT` with `inputPacket.projectFiles`, the required globals, and exact output path conventions.
- The preferred topology is:
  1. `LEGAL_CLAUSE_REVIEW` writes `comment-batches/<source-name>/clause-review.json`.
  2. `LEGAL_RISK_REVIEW` depends on clause review and writes `comment-batches/<source-name>/risk-review.json`.
  3. `LEGAL_TERMS_REVIEW` depends on clause review and writes `comment-batches/<source-name>/terms-review.json`.
  4. `LEGAL_COMPLIANCE_REVIEW` is optional, depends on clause review, and writes `comment-batches/<source-name>/compliance-review.json`.
  5. `LEGAL_RECOMMENDATIONS` or `LEGAL_DOCX_FINAL_REPORT` depends on all created specialist batches and writes `annotated-contracts/<source-name>-legal-review.docx`.
- Specialist roles should not write the final annotated DOCX. They write comment batches to avoid concurrent DOCX overwrites.
- The finalizer reads accepted comment batches, merges them with the `docx` skill, verifies the annotated DOCX, creates a `REPORT` artifact, and creates an owner decision item.

## Idempotency

Use the source project file path plus stage as the durable key. Re-running the lead should advance missing stages, not duplicate completed or active work.
