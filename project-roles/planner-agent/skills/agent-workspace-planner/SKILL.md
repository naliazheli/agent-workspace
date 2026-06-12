---
name: agent-workspace-planner
description: PLANNER_AGENT role skill for agent-workspace. Use when breaking a goal into optional feature groups and work items, writing acceptance criteria, defining output contracts, identifying dependencies, and recommending capability tags or skill bundle refs for worker assignment.
---

# Agent Workspace Planner

## Role

The PLANNER_AGENT decomposes a goal into ready-to-dispatch work. It should make the next worker's context obvious enough that execution can start without another planning round.

Use `$agent-workspace` first, then load only the target goal, relevant brief, memory, and existing feature group/work item tree.

## Reads And Writes

- Reads: project brief, shared memory, target goal, related feature groups and work items.
- Writes: optional feature groups, work items, recommended skill tags, memory.
- Core tools: `goal.get`, `feature.create`, `feature.update`, `workItem.create`, `workItem.update`, `workItem.markReady`, `memory.write`.

## Workflow

1. Restate the goal as deliverable outcomes and non-goals.
2. Decide the shallowest useful structure. For small or single-thread goals, skip feature creation and put work items directly under the goal.
3. Create feature groups only for multiple independently reviewable deliverables, parallel work streams, release phases, or capability areas. Do not create a feature group just to hold one work item.
4. Create work items with:
   - objective
   - required context
   - acceptance criteria
   - output contract
   - dependencies
   - suggested capabilities and skill bundle refs
5. Identify human-provided resources before execution work. If a downstream item needs a missing credential, API key, account, endpoint, approval, or other owner-controlled resource, create a separate owner-owned `INTEGRATION` work item with `inputPacket.resourceRequest` (`key`, `label`, `description`, `isSecret`, `category`, `required`, `createTaskOnMissing`, `value: ""`) and make the downstream item depend on it.
6. Mark worker work ready only when a worker can execute from the task packet and required resource request dependencies are configured or explicitly non-required.
7. Write planning assumptions or discovered constraints to memory.

## Goal Topology Decomposition

When the target goal needs more than one bounded item, propose a completion topology before creating work. Do not assume every multi-item goal needs a final report or aggregation item.

1. Classify the goal as `DIRECT`, `SERIAL`, `FAN_OUT_FAN_IN`, `TOTAL_TO_PARTS`, `TOTAL_PARTS_TOTAL`, or `ITERATIVE_REVIEW`.
2. Define the completion contract: acceptance bar, audience or consumer, required output paths, required sources/evidence, review gate, and whether a combined aggregation deliverable is required.
3. Identify independent lanes, serial phases, or revision loops. Examples: data collection, source research, technical analysis, risk review, policy review, implementation inspection, customer/market research, artifact validation, patch implementation, or release packaging.
4. Create one bounded item per lane, phase, or small batch. Avoid a single oversized "do everything" item.
5. Put topology metadata in `inputPacket.goalTopology`, slice metadata in `inputPacket.workSlice`, required project files in `inputPacket.projectFiles`, and required globals in `inputPacket.requiredGlobals`. Existing report templates may keep `reportGoal` and `researchSlice` as aliases.
6. Put exact promised output paths in `outputProjectFiles` or `outputContract.sharedFiles`. Downstream serial or aggregation work must be able to read those paths without guessing.
7. Create an aggregation/synthesis/delivery item only after upstream dependencies are accepted, or leave it DRAFT/blocked with explicit `dependsOn` until the lead fan-in gate passes. Aggregation items must carry enough context for a worker to start without re-scanning the project:
   - top-level `dependsOn` contains the accepted upstream work item ids.
   - `inputPacket.goalTopology` records mode, `needsAggregation`, and acceptance bar.
   - `inputPacket.projectFiles` lists accepted upstream shared files with `path` and `source`.
   - `inputPacket.acceptedUpstreamItems` lists `{ "workItemId": "...", "outputPaths": [...] }` for each accepted upstream item.
   - `outputContract.type` is `aggregation-output`, `synthesis-output`, or `delivery-output`, with exact `sharedFiles`.
8. Create owner resource items before blocked execution items. Do not ask workers to obtain or guess missing credentials, paid data access, accounts, approvals, or input files.
9. If feature groups help scanning, use them as lanes, parts, or phases. Do not create a feature group merely to contain one item.

## Direct API Pattern

When the runtime has `FEATURE_CREATE` and `WORK_ITEM_CREATE`, it may write directly through `agent-workspace` using:

- `POST {AGENT_WORKSPACE_BASE_URL}/v1/projects/{projectId}/features`
- `POST {AGENT_WORKSPACE_BASE_URL}/v1/projects/{projectId}/work-items`
- `PATCH {AGENT_WORKSPACE_BASE_URL}/v1/projects/{projectId}/work-items/{workItemId}`

Send `Authorization: Bearer {workspaceToken}` from `/opt/data/AGENT_WORKSPACE_RUNTIME.env`.
For long-lived runtimes, prefer sourcing `/opt/data/AGENT_WORKSPACE_RUNTIME.env` in the same shell command over reading secret values through `read_file`, because tool output may redact tokens.

Minimum useful planner write pattern:

1. Reuse the active goal as the default parent.
2. Create feature groups only when they add reviewable structure.
3. Create one or more work items linked to the goal, and to a feature group only when that group exists.
4. Put acceptance criteria and output contract onto the work item, not only into chat text.
5. Mark a worker item `READY` only after objective, dependencies, acceptance criteria, and output contract are sufficient for execution. `READY` and other status-only changes require `WORK_ITEM_STATUS_UPDATE`; broader edits require `WORK_ITEM_UPDATE`.
6. If the scope is unclear, write the first decomposition and separately list questions for OWNER or LEAD instead of blocking all progress.

## Guardrails

- Do not dispatch assignments; leave that to LEAD.
- Do not create work items that require full project access unless the role truly needs it.
- Avoid oversized packets; prefer dependency-linked work items.
