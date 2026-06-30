# Legal DOCX Terms Mapping

Use this skill for obligation, deadline, trigger, renewal, remedy, and exposure mapping after the clause comment batch exists.

## Required IO

- Download the source DOCX and read accepted upstream comment batches listed in `inputPacket.projectFiles`.
- Use the `docx` skill to extract paragraph indexes and anchor comments to the contract text.
- Write terms findings as comment JSON to the exact shared path in `inputPacket.commentBatchPath` or `outputContract.sharedFiles`, normally `comment-batches/<source-name>/terms-review.json`.
- Verify the comment batch with `project-file-read` before completing.

## Strict JSON Validation

The comment batch must be strict JSON, not JSON-like text. Escape any double quote inside a JSON string, or use Chinese quotation marks such as `“...”` / `《...》` in comment prose. Before upload and again after `project-file-read`, parse the exact content with `python -m json.tool` or `json.load`; do not mark the assignment complete until the parsed result succeeds.

## Comment Shape

Map who must do what, trigger events, deadlines, notice methods, cure periods, breach consequences, renewal or opt-out windows, payment schedules, post-termination duties, recurring obligations, remedies, and financial exposure. Calculate dates or amounts only when the source text gives enough information; otherwise state the missing assumption.

Do not overwrite the final annotated DOCX.
