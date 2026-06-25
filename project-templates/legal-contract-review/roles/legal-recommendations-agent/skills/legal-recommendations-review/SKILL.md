# Legal Recommendations Review

Use this skill for the second-pass contract review stage.

## Required IO

- Read the original source contract, first-pass clause review, risk assessment, terms map, and any compliance review listed in `inputPacket.projectFiles`.
- Write the final owner-facing report to the exact shared path provided by the lead, normally `final-reports/<source-name>-review-report.md`.
- Use `project-file-write`, `project-file-upload`, or `/v1/projects/{projectId}/files/write`.
- Verify the output with `project-file-list` or `project-file-read` before completing the assignment.

Do not substitute a local file under `/opt/data/workspace` when the assignment names `final-reports/`.

## Report Shape

Keep a visible disclaimer that the report is not legal advice. Include high, medium, and low risk sections, negotiation points, suggested replacement language where useful, obligations and dates, compliance or enforceability caveats when provided, missing context, source specialist files used, and practical next actions for the owner.

Do not silently skip a referenced specialist file. If a listed upstream file is missing or unreadable, stop and name the exact missing project path.
