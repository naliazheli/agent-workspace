# Legal DOCX Compliance Review

Use this skill for optional compliance and enforceability review when the contract or owner context raises jurisdiction, privacy, data, employment, consumer, regulated-industry, cross-border, or enforceability concerns.

## Required IO

- Download the source DOCX and read accepted upstream comment batches listed in `inputPacket.projectFiles`.
- Read relevant owner context from project globals.
- Use the `docx` skill to extract paragraph indexes and anchor comments to the contract text.
- Write compliance findings as comment JSON to the exact shared path in `inputPacket.commentBatchPath` or `outputContract.sharedFiles`, normally `comment-batches/<source-name>/compliance-review.json`.
- Verify the comment batch with `project-file-read` before completing.

## Comment Shape

Separate confirmed contract issues from jurisdiction-dependent questions. For every issue, include the clause reference, affected party, relevant jurisdiction/context assumption, why enforceability or compliance may be a concern, needed evidence, and recommended attorney-review question.

Consider data protection, privacy notices, cross-border transfer, employment or contractor classification, consumer protection, export controls, sanctions, anti-bribery, procurement requirements, and industry-specific obligations when relevant.

Do not overwrite the final annotated DOCX.
