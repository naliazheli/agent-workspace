# Legal DOCX Contract Planner

Use this skill for planning the `legal-contract-review-docx` project template.

The planner turns an uploaded DOCX contract into a durable work item graph. It does not perform legal analysis itself.

## Default Topology

Create a goal-scoped topology for each source contract:

1. `LEGAL_CLAUSE_REVIEW` writes `comment-batches/<source-name>/clause-review.json`.
2. `LEGAL_RISK_REVIEW` depends on the clause review and writes `comment-batches/<source-name>/risk-review.json`.
3. `LEGAL_TERMS_REVIEW` depends on the clause review and writes `comment-batches/<source-name>/terms-review.json`.
4. `LEGAL_COMPLIANCE_REVIEW` is optional. Create it only when the source contract, jurisdiction, review perspective, business context, or owner request raises privacy, data protection, employment, consumer, regulated-industry, cross-border, enforceability, or compliance concerns. It writes `comment-batches/<source-name>/compliance-review.json`.
5. `LEGAL_RECOMMENDATIONS` or `LEGAL_DOCX_FINAL_REPORT` depends on every created specialist item and writes `annotated-contracts/<source-name>-legal-review.docx`.

The coordinator dispatches `READY` or `NEEDS_REVISION` items by `workType`. Set top-level `goalId` on every created item and use top-level `dependsOn` so downstream items wait until upstream items are accepted.

## Work Item Packet

Every specialist item should include:

- A top-level `workType` that exactly matches the stage identifier.
- `inputPacket.projectFiles` with the source DOCX and accepted upstream comment-batch paths when relevant.
- `inputPacket.commentBatchPath` for specialist stages.
- `inputPacket.annotatedDocxPath` for the final stage.
- `inputPacket.goalTopology` with `mode`, `sourcePath`, `commentBatchPaths`, and `annotatedDocxPath`.
- `inputPacket.workSlice` with the stage name and exact expected output path.
- `outputContract.sharedFiles` with the exact project file path that must be written.
- Newline-delimited `acceptanceCriteria` requiring project-file output and verification.

## Guardrails

- Do not dispatch assignments. Leave eligible items `READY` for the coordinator.
- Do not write legal review output yourself.
- Do not let parallel specialists overwrite `annotated-contracts/`; they write JSON comment batches only.
