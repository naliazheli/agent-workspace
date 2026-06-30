---
name: docx
description: Use this skill for Word .docx documents, especially reading contract text and creating reviewer comments in a shared annotated DOCX.
---

# DOCX Review Skill

Use this skill when an assignment references a `.docx` project file or asks for Word comments, tracked document review, or an annotated contract.

This AgentCraft skill is intentionally narrow: it supports project-shared DOCX review workflows without requiring a full desktop Word installation. Use the helper script for paragraph extraction and Word comments, and use the `agent-workspace` project-file helpers for durable storage.

## Project File Workflow

Download project shared DOCX files before inspecting or editing them:

```bash
. /opt/data/skills/agent-workspace/scripts/project-files.sh
project-file-download "source-contracts/<source>.docx" /tmp/source.docx
python /opt/data/skills/docx/scripts/docx_review.py extract /tmp/source.docx --out /tmp/paragraphs.json
```

Upload generated DOCX files back to project shared storage:

```bash
project-file-upload /tmp/annotated.docx "annotated-contracts/<source>-legal-review.docx"
project-file-read "annotated-contracts/<source>-legal-review.docx" base64 >/tmp/verify.json
```

Do not leave required DOCX outputs only in `/tmp`, `/opt/data/workspace`, or chat text when the work item names a project shared path.

## Comment Batch Schema

Specialist reviewers should usually write comment batches instead of all editing the same DOCX concurrently. Store them under `comment-batches/<source>/<stage>.json`.

```json
{
  "sourcePath": "source-contracts/example.docx",
  "stage": "LEGAL_RISK_REVIEW",
  "comments": [
    {
      "paragraphIndex": 12,
      "anchor": "Limitation of Liability",
      "author": "Risk Assessor",
      "severity": "high",
      "category": "liability",
      "comment": "The liability cap excludes several high-impact carve-outs. Ask counsel whether buyer-side damages should be uncapped for confidentiality, data, IP, and gross negligence."
    }
  ]
}
```

Use `paragraphIndex` from the extracted paragraph list whenever possible. Include `anchor` as a short exact phrase from the paragraph as a fallback. Each comment should be concise, source-grounded, and include a concrete concern or recommended attorney/owner question.

## Applying Comments

The finalizer merges accepted role comment batches into one annotated DOCX:

```bash
python /opt/data/skills/docx/scripts/docx_review.py apply-comments \
  /tmp/source.docx \
  /tmp/all-comments.json \
  /tmp/annotated.docx
```

The comments input may be a JSON list or an object with a `comments` array. The helper preserves existing DOCX files and appends Word comments anchored to the requested paragraphs.

## Review Guardrails

- Do not give legal advice. Frame findings as preliminary review notes and attorney-review questions.
- Do not silently skip unreadable DOCX files or missing comment batches. Name the exact missing project path and stop that branch.
- Do not let parallel specialists overwrite `annotated-contracts/<source>-legal-review.docx`. Parallel roles write comment batches; the finalizer writes the annotated DOCX.
- Verify every promised project shared output before marking an assignment complete.
