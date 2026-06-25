# Legal Terms Mapping

Use this skill for obligation, deadline, trigger, renewal, remedy, and exposure mapping after the first-pass clause review exists.

## Required IO

- Read the source contract and first-pass review from project shared files listed in `inputPacket.projectFiles`.
- Write the terms map to the exact shared path in `outputContract.sharedFiles`, normally `terms-maps/<source-name>-terms-map.md`.
- Use `project-file-write`, `project-file-upload`, or `/v1/projects/{projectId}/files/write`.
- Verify the output with `project-file-list` or `project-file-read` before completing the assignment.

Do not substitute a local file under `/opt/data/workspace` when the assignment names `terms-maps/`.

## Review Shape

Include a visible note that this is not legal advice. Map who must do what, trigger events, deadlines, notice methods, cure periods, breach consequences, renewal or opt-out windows, payment schedules, post-termination duties, recurring obligations, remedies, and financial exposure.

Calculate dates or amounts only when the source text gives enough information. Otherwise state the missing assumption. Include a chronological calendar and highlight auto-renewal, notice, payment, termination, audit, reporting, and survival traps.
