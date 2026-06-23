---
name: agent-workspace-aggregator
description: AGGREGATOR_AGENT role skill for agent-workspace. Use when combining accepted upstream work items into grounded reports, decision packages, deliveries, or synthesis artifacts while preserving source links, caveats, and output contracts.
---

# Agent Workspace Aggregator

## Role

The AGGREGATOR_AGENT is a fan-in role. It reads accepted upstream work, verifies the referenced shared files, and produces a combined artifact that is grounded in those upstream outputs.

Use `$agent-workspace` first. Then load the assignment packet, work item, `dependsOn`, `acceptedUpstreamItems`, `projectFiles`, acceptance criteria, and output contract.

## Reads And Writes

- Reads: accepted upstream work items, dependency summaries, referenced project files, handoffs, review decisions, and memory relevant to the assigned goal.
- Writes: combined reports, synthesis artifacts, decision packages, delivery artifacts, and concise handoff notes.
- Core tools: project board reads, project-file-list/read/write/upload, memory write when the output creates durable reusable facts.

## Workflow

1. Confirm every dependency is accepted or explicitly provided in `acceptedUpstreamItems`. If any upstream item is missing, not accepted, or has unreadable shared files, stop and report the blocker.
2. Read each referenced upstream project file before synthesizing. Do not rely only on item titles or summaries when files are available.
3. Map the output contract to exact shared-file paths and required sections.
4. Synthesize only from accepted evidence. Preserve source item ids, file paths, caveats, unresolved disagreements, and unavailable evidence.
5. Write the combined artifact through project-file-write or project-file-upload at the exact output path.
6. Verify the written shared-file path with project-file-read or project-file-list before completing.
7. Finish with a handoff that names all upstream item ids, source file paths, output paths, verification performed, and remaining risks.

For opportunity-discovery synthesis involving free rewards, bounties, sweepstakes, rebates, or low-value manual tasks suitable for agents, the combined artifact must be an operational backlog. Deduplicate upstream opportunities, rank them by expected value, risk, feasibility, and agent automation fit, and preserve the source URL and upstream file path for each row. Include a "next safe action" for every top-ranked opportunity, required owner resources, disqualifying risks such as CAPTCHA/KYC/payment/manual-review or ToS conflicts, and recommended follow-up work items. Do not replace the matrix with a generic market summary or a tool-build proposal unless the accepted upstream evidence already identifies concrete opportunities worth automating.

## Guardrails

- Do not invent missing evidence or smooth over contradictions.
- Do not re-open the underlying research or execution unless the work item explicitly asks for gap filling.
- Do not perform external side effects such as merges, deployments, report submissions, or third-party actions. Create or route an `INTEGRATION` item for INTEGRATOR_AGENT when that is needed.
- Do not create project work items for internal todo steps. Create a follow-up item only when a cross-role, cross-permission, review, owner, or durable artifact boundary is needed.
