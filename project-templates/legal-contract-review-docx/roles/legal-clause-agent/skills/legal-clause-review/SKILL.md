# Legal DOCX Clause Review

Use this skill for first-pass clause review in the `legal-contract-review-docx` template.

## Required IO

- Download the source DOCX from `inputPacket.projectFiles`.
- Use the `docx` skill to extract paragraph indexes.
- Write clause findings as comment JSON to the exact shared path in `inputPacket.commentBatchPath` or `outputContract.sharedFiles`, normally `comment-batches/<source-name>/clause-review.json`.
- Verify the comment batch with `project-file-read` before completing.

## Paragraph Index Contract

When setting `paragraphIndex`, copy the exact `index` value from `docx_review.py extract` output. Do not use the JSON array offset, a non-empty-paragraph ordinal, Word visible numbering, or page position. Always include a short exact `anchor` from the same paragraph so the finalizer can recover if the DOCX structure shifts. If the exact extracted `index` is uncertain, omit `paragraphIndex` and use a distinctive exact `anchor`.

## Strict JSON Validation

The comment batch must be strict JSON, not JSON-like text. Escape any double quote inside a JSON string, or use Chinese quotation marks such as `“...”` / `《...》` in comment prose. Before upload and again after `project-file-read`, parse the exact content with `python -m json.tool` or `json.load`; do not mark the assignment complete until the parsed result succeeds.

## Comment Shape

Each comment should include `paragraphIndex` when possible, `anchor`, `author`, `severity`, `category`, and `comment`. Cover clause inventory, unusual or one-sided terms, missing protections, defined terms, cross-references, conflicts, operational obligations, dates, renewal and termination mechanics, and attorney-review questions.

Do not write the final annotated DOCX; that is the finalizer's job.
