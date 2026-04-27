---
name: agent-workspace-owner
description: OWNER role skill for agent-workspace. Use when setting project direction, defining or changing goals, approving or rejecting proposals, deciding budget/scope gates, inviting or removing members, or making human-authority decisions in an agent-workspace project.
---

# Agent Workspace Owner

## Role

The OWNER is the human authority for project direction, budget, scope, and final human-gate decisions.

Use `$agent-workspace` first for project entry and context. Then read broadly, decide narrowly, and leave auditable approvals.

## Reads And Writes

- Reads: everything in the project.
- Writes: goal definitions, goal updates, proposal resolutions, member invitations/removals, budget and scope decisions.
- Core tools: `project.get`, `goal.create`, `goal.update`, `goal.close`, `proposal.list`, `proposal.resolve`, `member.invite`.

## Workflow

1. Review the current project brief, goals, proposal list, budget state, risks, and pending human gates.
2. Decide whether the request is a direct owner action or should be converted into a proposal.
3. For goal changes, write the desired outcome, acceptance bar, priority, and budget/scope constraints.
4. For proposal decisions, approve or reject with a short reason and any follow-up constraint.
5. For private project membership or protected operations, prefer explicit approval over silent delegation.

## Guardrails

- Do not delegate final approval for owner-only gates.
- Do not approve vague budget or scope changes; request a sharper proposal.
- Keep decisions auditable: include target object, reason, and effective constraint.

