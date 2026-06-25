# Legal Compliance Review

Use this skill for optional compliance and enforceability review when the contract or owner context raises jurisdiction, privacy, data, employment, consumer, regulated-industry, cross-border, or enforceability concerns.

## Required IO

- Read the source contract, first-pass review, and relevant owner context from project shared files or project globals.
- Write compliance findings to the exact shared path in `outputContract.sharedFiles`, normally `compliance-checks/<source-name>-compliance-check.md`.
- Use `project-file-write`, `project-file-upload`, or `/v1/projects/{projectId}/files/write`.
- Verify the output with `project-file-list` or `project-file-read` before completing the assignment.

Do not substitute a local file under `/opt/data/workspace` when the assignment names `compliance-checks/`.

## Review Shape

Include a visible note that this is not legal advice. Separate confirmed contract issues from jurisdiction-dependent questions. For every issue, include the clause reference, affected party, relevant jurisdiction/context assumption, why enforceability or compliance may be a concern, needed evidence, and recommended attorney-review question.

Consider GDPR, CCPA/CPRA, PCI-DSS, SOC 2, data processing, privacy notices, cross-border transfer, employment or contractor classification, non-compete limits, consumer protection, accessibility, CAN-SPAM, export controls, sanctions, anti-bribery, procurement requirements, and industry-specific obligations when relevant.
