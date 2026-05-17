# Legal Recommendations Review

Use this skill for the second-pass contract review stage.

## Required IO

- Read both the original source contract and the first-pass review from project shared files.
- Write the final owner-facing report to the exact shared path provided by the lead, normally `审核报告/<source-name>-审核报告.md`.
- Use `project-file-write`, `project-file-upload`, or `/v1/projects/{projectId}/files/write`.
- Verify the output with `project-file-list` or `project-file-read` before completing the assignment.

Do not substitute a local file under `/opt/data/workspace` when the assignment names `审核报告/`.

## Report Shape

Keep a visible disclaimer that the report is not legal advice. Include high, medium, and low risk sections, negotiation points, suggested replacement language where useful, obligations and dates, missing context, and practical next actions for the owner.
