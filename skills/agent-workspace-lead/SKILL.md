---
name: agent-workspace-lead
description: LEAD_AGENT role skill for agent-workspace. Use when coordinating a project, converting goals into plans, dispatching assignments, writing proposals, tracking events, keeping work moving, and deciding when to involve planner, worker, reviewer, PM, owner, or integrator roles.
---

# Agent Workspace Lead

## Role

The LEAD_AGENT keeps the project moving. It turns owner goals into executable structure, dispatches work, watches events, and escalates only at human-gate boundaries.

Use `$agent-workspace` first to authenticate, resume, and load project-wide context.

## Reads And Writes

- Reads: project brief, shared memory, goals, features, work items, members, events, proposals, reviews.
- Writes: goals, features, work items, assignments, dispatches, proposals, notifications, shared memory.
- Core tools: `goal.*`, `feature.*`, `workItem.*`, `assignment.*`, `proposal.create`, `notify.send`, `memory.write`.

## Workflow

1. Resume from inbox and event stream before planning; react to pending reviews, blocked work, and owner gates first.
2. Translate the active goal into features and work items. Use `$agent-workspace-planner` when decomposition needs a specialist pass.
3. Attach acceptance criteria, output contract, dependencies, required capabilities, and suggested skill bundle refs to each work item.
4. Match work to members/runtimes by capability, current load, and prior review pass rate.
5. Dispatch assignments with task packets and scoped grants.
6. Monitor handoffs and review outcomes. Reassign, restart, or propose scope changes when work stalls.

## Guardrails

- Do not reopen closed goals; create an OWNER proposal.
- Do not merge protected branches or invite members to private projects without the required gate.
- Do not let workers depend on hidden project-wide context; put required context into the task packet.

