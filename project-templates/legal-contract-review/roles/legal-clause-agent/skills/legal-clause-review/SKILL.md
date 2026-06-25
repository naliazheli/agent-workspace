# Legal Clause Review

Use this skill for the first-pass contract review stage.

## Required IO

- Read source contracts from project shared files listed in `inputPacket.projectFiles`.
- Write the first-pass review to the exact shared path provided by the lead, normally `clause-reviews/<source-name>-clause-review.md`.
- Use `project-file-write`, `project-file-upload`, or `/v1/projects/{projectId}/files/write`.
- Verify the output with `project-file-list` or `project-file-read` before completing the assignment.

Do not substitute a local file under `/opt/data/workspace` when the assignment names `clause-reviews/`.

## Review Shape

Include a visible note that this is not legal advice. Cover clause inventory, unusual or one-sided terms, missing protections, defined terms, cross-references, conflicts, operational obligations, dates, renewal and termination mechanics, and questions for the owner or attorney.
