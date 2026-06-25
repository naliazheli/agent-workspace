# Legal Contract Planner

Use this skill for planning the `legal-contract-review` project template.

## Role

The planner turns an uploaded source contract into a durable work item graph. It does not perform legal analysis itself.

## Default Topology

Create a goal-scoped topology for each source contract:

Folder segments are fixed English identifiers. Source file names may remain in their original language, but output folder names must use the paths below exactly.

1. `LEGAL_CLAUSE_REVIEW` writes `clause-reviews/<source-name>-clause-review.md`.
2. `LEGAL_RISK_REVIEW` depends on the clause review and writes `risk-assessments/<source-name>-risk-assessment.md`.
3. `LEGAL_TERMS_REVIEW` depends on the clause review and writes `terms-maps/<source-name>-terms-map.md`.
4. `LEGAL_COMPLIANCE_REVIEW` is optional. Create it only when the source contract, jurisdiction, review perspective, business context, or owner request raises privacy, data protection, employment, consumer, regulated-industry, cross-border, enforceability, or compliance concerns. It writes `compliance-checks/<source-name>-compliance-check.md`.
5. `LEGAL_RECOMMENDATIONS` depends on every created specialist review item and writes `final-reports/<source-name>-review-report.md`.

The coordinator dispatches `READY` or `NEEDS_REVISION` items by `workType`. Set top-level `goalId` to the current goal id on every created worker item, and use top-level `dependsOn` so downstream items wait until upstream items are accepted.

## Work Item Packet

Every created worker item should include:

- A top-level `workType` that exactly matches the stage identifier. Do not use generic values such as `ANALYSIS`, `WORK`, `REVIEW`, `REPORT`, or `TASK`.
- `inputPacket.projectFiles` with project-relative paths for the source and any expected upstream outputs.
- `inputPacket.goalTopology` with `mode`, `needsAggregation`, `sourcePath`, and `finalReportPath`.
- `inputPacket.workSlice` with the stage name and exact expected output path.
- `outputContract.sharedFiles` with the exact output project file path.
- newline-delimited `acceptanceCriteria` requiring project-file read/write and verification of the exact output path.

Example first executable item:

```json
{
  "workType": "LEGAL_CLAUSE_REVIEW",
  "status": "READY",
  "goalId": "<current goal id>",
  "inputPacket": {
    "projectFiles": ["source-contracts/<source>.docx"],
    "workSlice": {
      "stage": "LEGAL_CLAUSE_REVIEW",
      "expectedOutputPath": "clause-reviews/<source>-clause-review.md"
    }
  },
  "outputContract": {
    "sharedFiles": ["clause-reviews/<source>-clause-review.md"]
  }
}
```

Use `FAN_OUT_FAN_IN` when risk, terms, and optional compliance can run after the clause review. Use `SERIAL` only for light review that needs clause review followed directly by recommendations.

## Guardrails

- Do not create all specialist stages blindly. Clause, risk, terms, and recommendations are the default durable path; compliance is conditional.
- Do not create feature groups unless they make the board easier to scan.
- Do not dispatch assignments. Leave eligible items `READY` for the coordinator.
- Do not write `clause-reviews/`, `risk-assessments/`, `terms-maps/`, `compliance-checks/`, or `final-reports/` outputs yourself.
