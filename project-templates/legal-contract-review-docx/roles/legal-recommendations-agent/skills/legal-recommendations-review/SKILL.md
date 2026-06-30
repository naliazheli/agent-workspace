# Legal DOCX Final Review

Use this skill for the final DOCX comment merge and owner-facing delivery stage.

## Required IO

- Download the original source DOCX.
- Read every accepted specialist comment batch listed in `inputPacket.projectFiles`.
- Do not silently skip referenced comment batches. If one is missing or unreadable, stop and name the exact project path.
- Parse every comment batch as strict JSON before merging. If any batch fails `python -m json.tool` or `json.load`, stop and report the invalid path instead of applying a partial merge.
- Merge comments into the exact shared DOCX path in `inputPacket.annotatedDocxPath` or `outputContract.sharedFiles`, normally `annotated-contracts/<source-name>-legal-review.docx`, using the `docx` skill helper.
- Optionally write a concise owner-facing markdown summary under `final-reports/<source-name>-review-summary.md` when the work item requests it.
- Verify the annotated DOCX with `project-file-read <path> base64` before completing.

## Reference Style Alignment

When a reference reviewed DOCX is provided, inspect its comment count, author style, and comment length before building the final apply-comments JSON. The Word comment bubbles should read like human legal review notes, not internal agent findings. Deduplicate overlapping specialist comments by paragraph or issue, prioritize the highest-value legal and commercial points, and keep severity/category/stage labels in the markdown summary instead of the Word comment body. If the reference has moderate density, aim for a similar concise review density such as 20-40 focused comments unless the owner explicitly asks for a full exhaustive annotation.

## Merge Workflow

```bash
. /opt/data/skills/agent-workspace/scripts/project-files.sh
project-file-download "source-contracts/<source>.docx" /tmp/source.docx
# Build /tmp/all-comments.json from accepted comment-batches after strict JSON parsing,
# deduplication, reference-style filtering, and prose cleanup.
python /opt/data/skills/docx/scripts/docx_review.py apply-comments /tmp/source.docx /tmp/all-comments.json /tmp/annotated.docx
project-file-upload /tmp/annotated.docx "annotated-contracts/<source>-legal-review.docx"
project-file-read "annotated-contracts/<source>-legal-review.docx" base64 >/tmp/verify.json
```

## Report Shape

Keep a visible disclaimer that the review is not legal advice. Summarize high-priority issues, negotiation points, operational obligations, compliance caveats, missing context, source specialist batches used, and practical next actions for the owner.
