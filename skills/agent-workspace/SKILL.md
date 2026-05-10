---
name: agent-workspace
description: Common agent-workspace runtime entry skill for authentication, grant/token handling, scoped project resume, inbox reading, context loading, heartbeat, and safe MCP/API coordination. Use this before any agent-workspace role skill or whenever an agent runtime needs to enter, re-enter, authorize, or fetch project context.
---

# Agent Workspace

## Purpose

Use this as the common entry skill for every `agent-workspace` runtime. It defines how to authenticate, resume a project, pull only the allowed context, and keep actions tied to the caller's grant, role, assignment, and inbox item.

## Entry Flow

1. Identify the principal type.
   - Host backend: use host credentials only for host actions such as project creation, member summaries, assignment dispatch, and access grant issuance.
   - Project runtime: use only a grant-derived runtime bearer token.
   - External integration: use only the narrow integration credential for external event ingestion.
2. Register or resolve the runtime identity when needed.
   - Use runtime registration credentials only for `runtime.register`.
   - Keep `runtimeId`, provider, framework, and wake endpoint stable across re-entry when possible.
3. Obtain or refresh project access.
   - Confirm there is an active `ProjectAccessGrant` for `projectId`, `memberId`, `runtimeId`, role, scopes, and `skillBundleRefs`.
   - Mint or refresh a short-lived `ProjectAccessToken` from the active grant.
   - Never treat host trust as runtime authority.
4. Resume the project.
   - Call the resume entrypoint with the runtime token.
   - Read inbox items first, then active assignments, task packets, linked threads/messages, and role-visible summaries.
   - If the resume response includes `boardSnapshot`, treat its goals, features, and work items as the current project state.
   - If `boardSnapshot` is missing or appears incomplete for the role, call `GET /v1/projects/{projectId}/board` before saying that no goals or work exist.
   - Advance cursors from the returned `lastSeq` or equivalent resume cursor.
5. Heartbeat while working.
   - Send presence updates during long work.
   - Stop writes immediately if token refresh fails, the grant is revoked, or the assignment is cancelled.

## Runtime Variables

For a runtime container, read these values from the environment or the mounted context file:

- `AGENT_WORKSPACE_BASE_URL`: the agent-facing workspace API base URL.
  Local Docker debug may use `http://host.docker.internal:3010`.
  Cloud runtimes should use the public or private service domain, for example `https://agent-workspace.agentcraft.work` or the unified API domain used by the host product.
- `AGENT_WORKSPACE_TOKEN`: short-lived runtime bearer token minted from the active access grant. This may become stale in long-lived runtimes.
- `/opt/data/AGENT_WORKSPACE_CONTEXT.json`: project id, member id, runtime id, role, scopes, skill bundle refs, the resolved workspace base URL, and the latest refreshed runtime token.
- `/opt/data/AGENT_WORKSPACE_RUNTIME.env`: shell-ready exports for the latest `AGENT_WORKSPACE_BASE_URL`, `AGENT_WORKSPACE_TOKEN`, and any saved project-global resources.
- Project-global resources are exported as `PROJECT_GLOBAL_<KEY>`. Common aliases may also exist for well-known credentials, for example `GITHUB_TOKEN` and `GH_TOKEN`.
- Owner resource work items carry `inputPacket.resourceRequest`. When the owner fills `value` and finishes the item, the host saves it as a project global and injects it into future runtime env files.

Never assume Docker service discovery names such as `agent-workspace` exist outside a local compose network.

## Context Loading

Load context in this order:

1. Inbox: urgent action items, `STOP_WORK`, `REWORK_REQUEST`, `REVIEW_REQUEST`, assignment dispatches.
2. Assignment or role target: active assignment, review, goal, or metric request.
3. Task packet or board slice: the narrowest packet that can answer the work.
4. Linked memory: referenced memory entries and only additional memory found by targeted search.
5. Event stream: project-wide events only for roles that have project-wide read permission.

Do not load the full project by default. A worker should use `taskPacket.get`; a reviewer should load the handoff, criteria, and relevant memory; a PM or lead may load broader events and metrics.
Treat `boardSnapshot` as an attention slice, not an exhaustive archive. Closed goals and work items may appear only in `statusCounts`; request `mode=planning` or `includeClosed=true` only when history is explicitly needed.
Do not infer that the project has no goals from an empty inbox or empty assignments. Use `boardSnapshot.goalSummaries`, `boardSnapshot.backlogGoalSummaries`, and `boardSnapshot.statusCounts.goals` from resume, or fetch the board directly, before reporting goal state.

## Authorization Rules

- Check membership before role permission.
- Check role and scope before every write.
- Include `projectId`, caller identity, and `clientRequestId` on mutating calls when supported.
- Treat grant revocation as a collaboration event, not just an auth error: stop work, acknowledge the inbox item if required, and avoid stale handoffs.
- Do not use project-wide reads to bypass role-scoped packets.
- Do not impersonate another member or runtime.

## Common MCP/API Pattern

Use stable `agent-workspace.v0.*` MCP tools when available. Otherwise use the matching HTTP endpoint from the service implementation.

Typical runtime sequence:

```text
runtime.register -> access-grant token -> runtime.resume -> inbox/task context -> role work -> heartbeat -> artifact/handoff/review/proposal
```

If MCP wrappers are not available, use the HTTP API directly with the refreshed credentials from `/opt/data/AGENT_WORKSPACE_RUNTIME.env`.
Treat that env file as the shell source of truth, because long-lived runtimes may receive refreshed tokens between turns.
Do not depend on `read_file` output to recover `workspaceToken`; secret values may be redacted there.
When using shell tools, source the env file in the same command. For example:

```bash
. /opt/data/AGENT_WORKSPACE_RUNTIME.env
curl -s -X POST "$AGENT_WORKSPACE_BASE_URL/v1/projects/$PROJECT_ID/features" \
  -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{...}'
```

Local Hermes runtime images may not include `curl` or `jq`, and runtimes usually cannot install packages with `apt-get`. If `curl` is missing, use the available standard runtime such as `python3` with `urllib.request` or Node.js `fetch`; do not spend time trying to install system packages.

Local Docker debug URLs such as `http://host.docker.internal:3010` may trigger an approval prompt in secure runtimes; approve once, then continue the same command flow.

Common runtime endpoints:

- `POST {base}/v1/runtimes/{runtimeId}/resume`
- `POST {base}/v1/runtimes/{runtimeId}/heartbeat`
- `GET {base}/v1/projects/{projectId}/board`
- `GET {base}/v1/projects/{projectId}/files`
- `GET {base}/v1/projects/{projectId}/files/read?path=...`
- `POST {base}/v1/projects/{projectId}/files/write`
- `POST {base}/v1/projects/{projectId}/files/upload`
- `POST {base}/v1/projects/{projectId}/features`
- `POST {base}/v1/projects/{projectId}/work-items`
- `GET {base}/v1/projects/{projectId}/work-items`
- `GET {base}/v1/projects/{projectId}/work-items/{workItemId}`
- `PATCH {base}/v1/projects/{projectId}/work-items/{workItemId}`
- `POST {base}/v1/projects/{projectId}/assignments` (requires `ASSIGNMENT_DISPATCH`; lead runtimes may use this to dispatch scoped work to an existing member/runtime)

Host API runtime helpers are available when `AIFACTORY_API_BASE_URL` and `AIFACTORY_RUNTIME_TOKEN` are present in `/opt/data/AGENT_WORKSPACE_RUNTIME.env`:

- `POST $AIFACTORY_API_BASE_URL/projects/{projectId}/agent-runtimes/runtime/launch`
- `POST $AIFACTORY_API_BASE_URL/projects/{projectId}/work-items/{workItemId}/assignments/runtime-dispatch`
- `POST $AIFACTORY_API_BASE_URL/projects/{projectId}/work-items/{workItemId}/assignments/runtime-claim`
- `PATCH $AIFACTORY_API_BASE_URL/projects/{projectId}/work-items/{workItemId}/runtime-update`
- `POST $AIFACTORY_API_BASE_URL/projects/{projectId}/work-items/{workItemId}/runtime-comments`
- `PATCH $AIFACTORY_API_BASE_URL/projects/{projectId}/work-items/{workItemId}/assignments/{assignmentId}/runtime-update`

Use `Authorization: Bearer $AIFACTORY_RUNTIME_TOKEN`. For a ready worker item with no active worker runtime, call `runtime-dispatch` with `role: "WORKER_AGENT"` and `launchIfMissing: true`; the host will launch a worker runtime, assign the item to that worker, and wake the target runtime with the assignment packet. When a worker runtime is idle and selects an eligible unassigned item itself, it must first call `runtime-claim`; use the returned `assignment.id` and `updateEndpoint` for progress. To update a work item through the host runtime helper, call `runtime-update` with fields such as `{ "status": "READY" }` or `{ "status": "ACCEPTED" }`. A worker should not update the work item status directly; it should claim or use its own assignment, then update that assignment to `ACTIVE` or `COMPLETED` through the assignment runtime helper, which moves the work item to `IN_PROGRESS` or `IN_REVIEW`. Do not self-assign worker work to the lead member.

If a work item is unclear and needs owner clarification, add a visible work item comment through `runtime-comments` using JSON such as `{ "content": "@owner Please clarify ..." }` with the exact missing decision or resource. When the richer agent-workspace thread API is needed, also send `POST {base}/v1/projects/{projectId}/messages` with `messageType: "QUESTION"`, `threadRefType: "WORK_ITEM"`, `threadRefId`, and `mentions`/`targetMemberIds` for the owner project member so the owner receives an inbox mention.

When creating a work item from an active goal or feature, include the available `goalId` and `featureId` in the request. `goalId` is optional only for truly unscoped items; if the item belongs to a known feature whose feature has a goal, keep the goal association so the board and detail views can show full goal context. `acceptanceCriteria` is a single string, not an array; use a newline-delimited numbered list when there are multiple criteria.
Use `READY` for work items that are dispatchable, `IN_PROGRESS` while execution is underway, `IN_REVIEW` after a worker handoff, and `ACCEPTED` as the completed/finished state. Do not use `COMPLETED` or `DONE` for project work item status.

`PATCH /v1/projects/{projectId}/work-items/{workItemId}` requires `WORK_ITEM_STATUS_UPDATE` when changing only `status`; broader field updates require `WORK_ITEM_UPDATE`. `PROJECT_BOARD_READ` covers list/get, and `WORK_ITEM_CREATE` covers create.

For a missing owner-controlled resource, create a separate owner-owned work item instead of embedding the blocker inside a worker task. Set `ownerId` to the project owner user id, not the owner member id; use a high priority, and put the request under `inputPacket.resourceRequest` with `key`, `label`, `description`, `isSecret`, `category`, `required`, `createTaskOnMissing`, and `value: ""`. Use one atomic resource item per project-global key, with stable lowercase snake_case keys. Do not infer a vendor, website, social network, API provider, platform-specific key set, or platform-specific skill from a generic resource key or generic task; keep labels and descriptions neutral unless the owner explicitly named that platform. Downstream work should depend on this item or wait until the corresponding `PROJECT_GLOBAL_<KEY>` is available.

`runtime.resume` returns the runtime-targeted inbox, active assignment summaries, linked thread summaries, and an event cursor. Workers should treat `ASSIGNMENT_DISPATCH` inbox items and assignment `contextPacket` values as their primary task packet.

## Project Shared Resources

Project shared resource storage is owned by `agent-workspace`, not by a host product. Use it for files that project members and authorized agent runtimes should share: briefs, source documents, generated reports, datasets, review evidence, handoff bundles, submitted work item attachments, and other durable project context.

Access rules:

- Read requires the runtime token scope `PROJECT_FILE_READ`.
- Write, upload, and delete require `PROJECT_FILE_WRITE`.
- Keep all paths project-relative. Do not use leading `/`, `..`, or host filesystem paths.
- Treat download URLs as short-lived convenience links. Do not paste them into durable memory as if they were permanent authority.

Shell helpers are available in this skill bundle. Source them before use:

```bash
. /opt/data/skills/agent-workspace/scripts/project-files.sh
project-file-list
project-file-search docs spec
project-file-read docs/brief.md
project-file-write notes/status.md ./local-status.md
project-file-upload ./report.pdf reports/report.pdf
project-file-download-url reports/report.pdf
```

If the helper script is not mounted, call the HTTP endpoints directly with `AGENT_WORKSPACE_BASE_URL`, `AGENT_WORKSPACE_PROJECT_ID`, and `AGENT_WORKSPACE_TOKEN` from `/opt/data/AGENT_WORKSPACE_RUNTIME.env`.

When a role-specific skill is also relevant, invoke it after this common entry flow:

- `$agent-workspace-owner`
- `$agent-workspace-lead`
- `$agent-workspace-planner`
- `$agent-workspace-worker`
- `$agent-workspace-reviewer`
- `$agent-workspace-pm`
- `$agent-workspace-integrator`
