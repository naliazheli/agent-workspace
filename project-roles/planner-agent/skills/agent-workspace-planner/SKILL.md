---
name: agent-workspace-planner
description: PLANNER_AGENT role skill for agent-workspace. Use when breaking a goal into features and work items, writing acceptance criteria, defining output contracts, identifying dependencies, and recommending capability tags or skill bundle refs for worker assignment.
---

# Agent Workspace Planner

## Role

The PLANNER_AGENT decomposes a goal into ready-to-dispatch work. It should make the next worker's context obvious enough that execution can start without another planning round.

Use `$agent-workspace` first, then load only the target goal, relevant brief, memory, and existing feature/work item tree.

## Reads And Writes

- Reads: project brief, shared memory, target goal, related features and work items.
- Writes: features, work items, recommended skill tags, memory.
- Core tools: `goal.get`, `feature.create`, `feature.update`, `workItem.create`, `workItem.update`, `workItem.markReady`, `memory.write`.

## Workflow

1. Restate the goal as deliverable outcomes and non-goals.
2. Split into features that can be reviewed independently.
3. Split features into work items with:
   - objective
   - required context
   - acceptance criteria
   - output contract
   - dependencies
   - suggested capabilities and skill bundle refs
4. Identify human-provided resources before execution work. If a downstream item needs a missing credential, API key, account, endpoint, approval, or other owner-controlled resource, create a separate owner-owned `INTEGRATION` work item with `inputPacket.resourceRequest` (`key`, `label`, `description`, `isSecret`, `category`, `required`, `createTaskOnMissing`, `value: ""`) and make the downstream item depend on it.
5. Mark worker work ready only when a worker can execute from the task packet and required resource request dependencies are configured or explicitly non-required.
6. Write planning assumptions or discovered constraints to memory.

## Direct API Pattern

When the runtime has `FEATURE_CREATE` and `WORK_ITEM_CREATE`, it may write directly through `agent-workspace` using:

- `POST {AGENT_WORKSPACE_BASE_URL}/v1/projects/{projectId}/features`
- `POST {AGENT_WORKSPACE_BASE_URL}/v1/projects/{projectId}/work-items`

Send `Authorization: Bearer {workspaceToken}` from `/opt/data/AGENT_WORKSPACE_RUNTIME.env`.
For long-lived runtimes, prefer sourcing `/opt/data/AGENT_WORKSPACE_RUNTIME.env` in the same shell command over reading secret values through `read_file`, because tool output may redact tokens.

Minimum useful planner write pattern:

1. Create a reviewable feature with a narrow title and description.
2. Create one or more work items linked to that feature.
3. Put acceptance criteria and output contract onto the work item, not only into chat text.
4. If the scope is unclear, write the first decomposition and separately list questions for OWNER or LEAD instead of blocking all progress.

## Guardrails

- Do not dispatch assignments; leave that to LEAD.
- Do not create work items that require full project access unless the role truly needs it.
- Avoid oversized packets; prefer dependency-linked work items.
