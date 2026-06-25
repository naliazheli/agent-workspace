# Legal Risk Review

Use this skill for contract risk assessment after the first-pass clause review exists.

## Required IO

- Read the source contract and first-pass review from project shared files listed in `inputPacket.projectFiles`.
- Write the risk assessment to the exact shared path in `outputContract.sharedFiles`, normally `risk-assessments/<source-name>-risk-assessment.md`.
- Use `project-file-write`, `project-file-upload`, or `/v1/projects/{projectId}/files/write`.
- Verify the output with `project-file-list` or `project-file-read` before completing the assignment.

Do not substitute a local file under `/opt/data/workspace` when the assignment names `risk-assessments/`.

## Review Shape

Include a visible note that this is not legal advice. Cover high, medium, and low risks; severity; likelihood; business impact; negotiability; financial exposure when inferable; affected party; clause references; rationale; and suggested mitigation or negotiation stance.

Pay special attention to indemnity, liability caps and carve-outs, IP ownership, non-competes, exclusivity, auto-renewal, payment traps, termination restrictions, warranties, data handling, dispute forum, audit rights, unilateral change rights, and one-sided obligations.
