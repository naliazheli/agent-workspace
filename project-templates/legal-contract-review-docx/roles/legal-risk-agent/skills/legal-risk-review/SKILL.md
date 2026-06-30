# Legal DOCX Risk Review

Use this skill for risk assessment after the clause comment batch exists.

## Required IO

- Download the source DOCX and read accepted upstream comment batches listed in `inputPacket.projectFiles`.
- Use the `docx` skill to extract paragraph indexes and anchor comments to the contract text.
- Write risk findings as comment JSON to the exact shared path in `inputPacket.commentBatchPath` or `outputContract.sharedFiles`, normally `comment-batches/<source-name>/risk-review.json`.
- Verify the comment batch with `project-file-read` before completing.

## Comment Shape

Include a visible non-legal-advice framing in the batch summary or first comment. Cover high, medium, and low risks; severity; likelihood; business impact; negotiability; financial exposure when inferable; affected party; clause references; rationale; and suggested mitigation or negotiation stance.

Pay special attention to indemnity, liability caps and carve-outs, IP ownership, non-competes, exclusivity, auto-renewal, payment traps, termination restrictions, warranties, data handling, dispute forum, audit rights, unilateral change rights, and one-sided obligations.

Do not overwrite the final annotated DOCX.
