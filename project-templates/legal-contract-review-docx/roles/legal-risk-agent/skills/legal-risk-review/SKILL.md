# Legal DOCX Risk Review

Use this skill for risk assessment after the clause comment batch exists.

## Required IO

- Download the source DOCX and read accepted upstream comment batches listed in `inputPacket.projectFiles`.
- Use the `docx` skill to extract paragraph indexes and anchor comments to the contract text.
- Write risk findings as comment JSON to the exact shared path in `inputPacket.commentBatchPath` or `outputContract.sharedFiles`, normally `comment-batches/<source-name>/risk-review.json`.
- Verify the comment batch with `project-file-read` before completing.

## Paragraph Index Contract

When setting `paragraphIndex`, copy the exact `index` value from `docx_review.py extract` output. Do not use the JSON array offset, a non-empty-paragraph ordinal, Word visible numbering, or page position. Always include a short exact `anchor` from the same paragraph so the finalizer can recover if the DOCX structure shifts. If the exact extracted `index` is uncertain, omit `paragraphIndex` and use a distinctive exact `anchor`.

## Strict JSON Validation

The comment batch must be strict JSON, not JSON-like text. Escape any double quote inside a JSON string, or use Chinese quotation marks such as `“...”` / `《...》` in comment prose. Before upload and again after `project-file-read`, parse the exact content with `python -m json.tool` or `json.load`; do not mark the assignment complete until the parsed result succeeds.

## Comment Shape

Include a visible non-legal-advice framing in the batch summary or first comment. Cover high, medium, and low risks; severity; likelihood; business impact; negotiability; financial exposure when inferable; affected party; clause references; rationale; and suggested mitigation or negotiation stance.

Pay special attention to indemnity, liability caps and carve-outs, IP ownership, non-competes, exclusivity, auto-renewal, payment traps, termination restrictions, warranties, data handling, dispute forum, audit rights, unilateral change rights, and one-sided obligations.

Do not overwrite the final annotated DOCX.
