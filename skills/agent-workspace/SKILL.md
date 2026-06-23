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
   - If the resume response includes `boardSnapshot`, treat its goals, features, and work items as the current attention slice.
   - If `boardSnapshot` is missing or appears incomplete for the role, call `GET /v1/projects/{projectId}/board` before saying that no goals or work exist.
   - For lead/PM goal-frontier review, use paginated and status-filtered `GET /v1/projects/{projectId}/goals?statuses=IN_PROGRESS,BLOCKED&includeClosed=false&limit=100` only when managing all active goals, polling, or when the board slice is incomplete. Then read work items goal-by-goal with `GET /v1/projects/{projectId}/work-items?goalId=<goalId>&statuses=READY,NEEDS_REVISION,IN_REVIEW,ASSIGNED,IN_PROGRESS,REPORT_READY,REJECTED&limit=100&page=1`; add `statuses=ACCEPTED` only for closure or aggregation checks.
   - For lead/PM polling over many goals, maintain a human-readable lead workspace such as `coordination/lead.md` and a durable goal ledger such as `coordination/lead-goal-ledger.jsonl` in project shared storage. Read both at the start of the polling run, append one ledger record after each inspected goal, and update `lead.md` before stopping with the cursor, next goal queue, skipped reasons, and unresolved blockers.
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
- `AGENT_WORKSPACE_WORK_ITEM_ID`: optional active work item focus for a single shell session. Prefer per-command `--work-item <workItemId>` on helper calls when handling dispatched assignments, because runtimes may process different items in different sessions.
- `/opt/data/AGENT_WORKSPACE_CONTEXT.json`: project id, member id, runtime id, role, scopes, skill bundle refs, the resolved workspace base URL, and the latest refreshed runtime token.
- `/opt/data/AGENT_WORKSPACE_RUNTIME.env`: shell-ready exports for the latest `AGENT_WORKSPACE_BASE_URL`, `AGENT_WORKSPACE_TOKEN`, and workspace-owned project-global resources.
- Project-global resources are stored in `agent-workspace`, can be read through `GET /v1/projects/{projectId}/globals`, and are exported into runtime env files as `PROJECT_GLOBAL_<KEY>`. Common aliases may also exist for well-known credentials, for example `GITHUB_TOKEN` and `GH_TOKEN`.
- Owner resource work items carry `inputPacket.resourceRequest`. When the owner fills `value` and finishes the item, the host saves it as a project global and injects it into future runtime env files.

Never assume Docker service discovery names such as `agent-workspace` exist outside a local compose network.

## Context Loading

Load context in this order:

1. Inbox: urgent action items, `STOP_WORK`, `REWORK_REQUEST`, `REVIEW_REQUEST`, assignment dispatches.
2. Assignment or role target: active assignment, review, goal, or metric request.
3. Task packet or board slice: the narrowest packet that can answer the work.
4. Linked memory: packet-provided `memoryRefs` first, then only additional memory found by targeted search when the packet is missing required historical context.
5. Event stream: project-wide events only for roles that have project-wide read permission.

Do not load the full project by default. A worker should use `taskPacket.get`; a reviewer should load the handoff, criteria, and relevant memory; a PM or lead should start from resume/board slices and load broader events, metrics, files, memory, globals, or exact item details only when they can change the current coordination decision.
Treat `boardSnapshot` as an attention slice, not an exhaustive archive. Closed goals and work items may appear only in `statusCounts`; request `mode=planning` or `includeClosed=true` only when history is explicitly needed. When a lead must manage every active goal or compare item coverage against goal closure criteria, paginate `/goals` with active statuses, then read `/work-items?goalId=<goalId>` with attention statuses for inspected goals instead of loading one all-items page.
Do not infer that the project has no goals from an empty inbox or empty assignments. Use `boardSnapshot.goalSummaries`, `boardSnapshot.backlogGoalSummaries`, and `boardSnapshot.statusCounts.goals` from resume, or fetch the board directly, before reporting goal state.

### Lead Workspace

For long-running lead/PM polling, keep a small human-readable workspace in project shared storage. Use `coordination/lead.md` unless the project template names a more specific path.

`lead.md` is a dashboard and checkpoint, not the source of truth. Goal, work item, assignment, review, resource, file, and memory truth still comes from the workspace and host APIs.

Recommended shape:

```md
# Lead Workspace

## Current Frontier Policy
- Max goals per polling tick: 5
- Priority order: lead-attention items, changed digest, blocked goals, oldest unchecked

## Polling Cursor
- lastRunId:
- nextGoalCursor:
- unfinishedScanReason:

## Active Goal Queue
| goalId | topology | lastDigest | leadAttention | nextAction |
|---|---|---|---|---|

## Project-Level Decisions
-

## Open Risks / Owner Gates
-
```

At the start of a polling run, read `coordination/lead.md` if present to recover the previous cursor, priority queue, project-level decisions, and unresolved blockers. Do not ask the host to inject the full file into the prompt; read it through project-file-read so normal project-file authorization and token limits apply.

Before stopping a polling run, update `coordination/lead.md` when the frontier changed or the pass did not finish. Include `lastRunId`, `nextGoalCursor`, `unfinishedScanReason`, a compact next-goal queue, unresolved blockers, and any project-level decisions that should survive chat/session loss.

For very complex goals, a lead may create `coordination/goals/<goalId>.md`, but do not create per-goal files for ordinary goals. Prefer the JSONL ledger for per-goal machine state.

### Lead Goal Ledger

For long-running lead/PM polling, track goal-frontier progress in project shared storage instead of relying on chat history or runtime memory. Use `coordination/lead-goal-ledger.jsonl` unless the project template names a more specific ledger path.

At the start of a polling run:

1. Read `coordination/lead.md` if it exists.
2. Read the existing ledger if it exists.
3. Page through active goals with `GET /v1/projects/{projectId}/goals?statuses=IN_PROGRESS,BLOCKED&includeClosed=false&limit=100`.
4. For each goal under consideration, read only that goal's lead-attention work items with `GET /v1/projects/{projectId}/work-items?goalId=<goalId>&statuses=READY,NEEDS_REVISION,IN_REVIEW,ASSIGNED,IN_PROGRESS,REPORT_READY,REJECTED&limit=100&page=1`; read `statuses=ACCEPTED` only when checking sufficiency, dependencies, or aggregation.
5. Compute a compact `statusDigest` from goal id/status/updatedAt, linked work item ids/statuses/workTypes, and open assignment statuses.

After inspecting a goal, append a JSONL record with:

```json
{
  "pollingRunId": "2026-06-07T12:34:56.000Z:lead-runtime-id",
  "timestamp": "2026-06-07T12:35:10.000Z",
  "goalId": "goal-id",
  "statusDigest": "short-stable-digest",
  "decision": "skip|created-work|accepted|blocked|needs-owner",
  "nextAction": "short reason",
  "createdWorkItemIds": []
}
```

On later polling runs, skip a goal only when its latest ledger record has the same `statusDigest` and there is no `READY`, `NEEDS_REVISION`, `IN_REVIEW`, `ownerAction`, or `resourceRequest` work that needs lead attention. If a runtime stops mid-pass, the next run resumes from `lead.md` and the ledger instead of restarting the entire project scan.

### Lead Polling Frontier Review

Lead polling is a project-wide control loop, not a worker task. When a lead receives a timed polling message or a message with `Wake reason: ...`, treat it as a fresh frontier-review pass.

Read enough context to decide, but avoid broad project-wide detail scans. Read, in order:

1. `runtime.resume`, inbox, active assignments, `boardSnapshot`, and the event cursor.
2. Project globals with `GET /v1/projects/{projectId}/globals` for configured/presence metadata. Use `includeValues=true` only when the role is authorized and the actual value is required for the current decision; never print or copy secret values.
3. Active goals with `GET /v1/projects/{projectId}/goals?statuses=IN_PROGRESS,BLOCKED&includeClosed=false&limit=100` when polling, managing all goals, or when the board slice is incomplete.
4. For each active goal under consideration, linked lead-attention work item summaries with `GET /v1/projects/{projectId}/work-items?goalId=<goalId>&statuses=READY,NEEDS_REVISION,IN_REVIEW,ASSIGNED,IN_PROGRESS,REPORT_READY,REJECTED&limit=100&page=1`; read accepted summaries separately only when they can change closure or aggregation decisions.
5. Exact work-item detail only when it can change the lead decision: pending review, NEEDS_REVISION, owner resource/action, failed or stale assignment, dependency input, aggregation candidate, or candidate goal completion.
6. Recent events with `GET /v1/projects/{projectId}/events` and members/runtime summaries with `GET /v1/projects/{projectId}/members`.
7. Assignment/runtime health with `GET $AIFACTORY_API_BASE_URL/projects/{projectId}/assignments/runtime-state?limit=100` using `AIFACTORY_RUNTIME_TOKEN` when available.
8. The lead workspace and ledger with `project-file-read`; project shared files only for paths named by accepted upstream outputs, output contracts, handoffs, or a candidate final/aggregation artifact.
9. Targeted memory search only for reusable decisions, constraints, facts, risks, and open questions relevant to the goal being inspected.

Then decide per goal:

- Skip only when the ledger digest is unchanged and no READY, NEEDS_REVISION, IN_REVIEW, owner resource/action, failed assignment, or blocked dependency needs lead attention.
- Classify the goal completion topology: `DIRECT`, `SERIAL`, `FAN_OUT_FAN_IN`, `TOTAL_TO_PARTS`, `TOTAL_PARTS_TOTAL`, or `ITERATIVE_REVIEW`.
- Create or surface owner-owned resource items when required globals or approvals are missing.
- Create the smallest missing READY/NEEDS_REVISION work item when execution, review, integration, aggregation, delivery, or a serial next step is missing.
- Leave coordinator-enabled projects to the COORDINATOR for assignment and launch. Use host `runtime-dispatch` only as an explicit fallback.
- If accepted upstream work is sufficient but the goal requires a combined deliverable, create an aggregation/synthesis/delivery item instead of closing the goal.
- Mark a goal `DONE` only after accepted items or an accepted aggregation artifact satisfies the goal acceptance bar and no linked non-terminal work remains.
- Write a ledger record after every inspected goal, including skips, blockers, and created work item ids.
- Before stopping, update `coordination/lead.md` with the polling cursor, skipped reasons, next goal queue, unresolved blockers, and project-level decisions.

For aggregation-required goals, run the fan-out/fan-in pattern: plan bounded lanes or parts, create parallel or serial upstream items according to the topology, wait for accepted upstream outputs and resolved resources, create aggregation only when the fan-in gate passes, require review when the acceptance bar or status flow requires it, then close the goal.

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
In a local Codex runner bundle, the same file is usually `./AGENT_WORKSPACE_RUNTIME.env` in the current working directory; use that local path when `/opt/data` is not present.
Treat that env file as the shell source of truth, because long-lived runtimes may receive refreshed tokens between turns.
Do not depend on `read_file` output to recover `workspaceToken`; secret values may be redacted there.
When a turn is focused on a specific work item, bind each project shared-file, memory, or workspace-message write to that item. For shell helpers, prefer `--work-item <workItemId>` on the command itself. For direct HTTP calls, send `X-AgentCraft-Work-Item-Id` or a `workItemId` field. Use `export AGENT_WORKSPACE_WORK_ITEM_ID=<workItemId>` only inside a tightly scoped shell session for that same item; do not write it into `/opt/data/AGENT_WORKSPACE_RUNTIME.env`.
When using shell tools, source the env file in the same command. For example:

```bash
. /opt/data/AGENT_WORKSPACE_RUNTIME.env
python3 - <<'PY'
import json, os, urllib.request

body = json.dumps({"name": "..."}).encode()
req = urllib.request.Request(
    f"{os.environ['AGENT_WORKSPACE_BASE_URL']}/v1/projects/{os.environ['PROJECT_ID']}/features",
    data=body,
    method="POST",
    headers={
        "Authorization": f"Bearer {os.environ['AGENT_WORKSPACE_TOKEN']}",
        "Content-Type": "application/json",
    },
)
print(urllib.request.urlopen(req).read().decode())
PY
```

Local Docker debug URLs such as `http://host.docker.internal:3010` may trigger an approval prompt in secure runtimes; approve once, then continue the same command flow.

Common runtime endpoints:

- `POST {base}/v1/runtimes/{runtimeId}/resume`
- `POST {base}/v1/runtimes/{runtimeId}/heartbeat`
- `GET {base}/v1/projects/{projectId}/board`
- `GET {base}/v1/projects/{projectId}/goals` (`status=<id>` or `statuses=A,B`, `page`, `limit`, `includeClosed`)
- `GET {base}/v1/projects/{projectId}/goals/{goalId}`
- `GET {base}/v1/projects/{projectId}/files`
- `GET {base}/v1/projects/{projectId}/files/read?path=...`
- `GET {base}/v1/projects/{projectId}/files/download?path=...`
- `POST {base}/v1/projects/{projectId}/files/write`
- `POST {base}/v1/projects/{projectId}/files/upload`
- `POST {base}/v1/projects/{projectId}/files/folders`
- `GET {base}/v1/projects/{projectId}/globals` (requires `PROJECT_GLOBAL_READ`; add `includeValues=true` only when the authorized runtime truly needs values)
- `PUT {base}/v1/projects/{projectId}/globals` (requires `PROJECT_GLOBAL_WRITE`; include `workItemId` and `source` when a work item is the reason for the write so the project event graph can retain that context)
- `GET {base}/v1/projects/{projectId}/memories?q=...&memoryType=...` (requires `MEMORY_READ`)
- `POST {base}/v1/projects/{projectId}/memories` (requires `MEMORY_WRITE`)
- `POST {base}/v1/projects/{projectId}/features`
- `POST {base}/v1/projects/{projectId}/work-items`
- `GET {base}/v1/projects/{projectId}/work-items` (`goalId`, `featureId`, `ownerId`, `status=<id>` or `statuses=A,B`, `page`, `limit`, `includeClosed`)
- `GET {base}/v1/projects/{projectId}/work-items/{workItemId}`
- `PATCH {base}/v1/projects/{projectId}/work-items/{workItemId}`
- `POST {base}/v1/projects/{projectId}/assignments` (requires `ASSIGNMENT_DISPATCH`; lead runtimes may use this to dispatch scoped work to an existing member/runtime)

Host API runtime helpers are available when `AIFACTORY_API_BASE_URL` and `AIFACTORY_RUNTIME_TOKEN` are present in `/opt/data/AGENT_WORKSPACE_RUNTIME.env`. These are only for host-owned coordination writes and failed-runtime recovery. Do not use the host API for `runtime.resume`, board reads, work-item listing, project globals, project files, or project memory; those must use `AGENT_WORKSPACE_BASE_URL` with `AGENT_WORKSPACE_TOKEN`. For direct project file reads, list with `GET $AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/files?prefix=<path>&recursive=true&limit=100`; there is no `/files/list` route.

- `POST $AIFACTORY_API_BASE_URL/projects/{projectId}/agent-runtimes/runtime/launch`
- `POST $AIFACTORY_API_BASE_URL/projects/{projectId}/goals/runtime-create`
- `PATCH $AIFACTORY_API_BASE_URL/projects/{projectId}/goals/{goalId}/runtime-update`
- `POST $AIFACTORY_API_BASE_URL/projects/{projectId}/work-items/{workItemId}/assignments/runtime-dispatch`
- `POST $AIFACTORY_API_BASE_URL/projects/{projectId}/work-items/{workItemId}/assignments/runtime-claim`
- `PATCH $AIFACTORY_API_BASE_URL/projects/{projectId}/work-items/{workItemId}/runtime-update`
- `POST $AIFACTORY_API_BASE_URL/projects/{projectId}/work-items/{workItemId}/runtime-comments`
- `GET $AIFACTORY_API_BASE_URL/projects/{projectId}/work-items/{workItemId}/runtime-comments`
- `PATCH $AIFACTORY_API_BASE_URL/projects/{projectId}/work-items/{workItemId}/assignments/{assignmentId}/runtime-update`
- `GET $AIFACTORY_API_BASE_URL/public/projects/{projectId}/agent-runtimes/{memberId}/workspace?maxDepth=4`
- `GET $AIFACTORY_API_BASE_URL/public/projects/{projectId}/agent-runtimes/{memberId}/workspace/download?path={projectRelativeWorkspacePath}`

Use `Authorization: Bearer $AIFACTORY_RUNTIME_TOKEN`. `AIFACTORY_API_BASE_URL` is a complete API base and may already end in `/api`; append `/projects/...` directly for runtime launch/dispatch/update/comment helpers, and append `/public/projects/...` for cross-runtime workspace list/download. Do not prepend another `/api`. Do not call host `/projects/...` endpoints without this bearer token. Do not use owner UI goal routes such as `PATCH /projects/{projectId}/goals/{goalId}` or guessed routes such as `/goals/{goalId}/status`; use `goals/{goalId}/runtime-update` for allowed runtime goal status updates. The canonical work-item create helper is `POST /projects/{projectId}/work-items/runtime-create` with no source work-item id segment. Do not use `/work-items/{workItemId}/runtime-create` unless you are deliberately falling back to the compatibility alias. Do not use owner UI comment routes such as `GET /projects/{projectId}/work-items/{workItemId}/comments`; runtimes must read work-item comments through `GET /projects/{projectId}/work-items/{workItemId}/runtime-comments` or use agent-workspace messages/assignment handoff context. For a ready worker item with no active worker runtime, call `runtime-dispatch` with `role: "WORKER_AGENT"` and `launchIfMissing: true`; the host will launch a worker runtime, assign the item to that worker, and wake the target runtime with the assignment packet. When a worker runtime is idle and selects an eligible unassigned item itself, it must first call `runtime-claim`; use the returned `assignment.id` and `updateEndpoint` for progress. To update a work item through the host runtime helper, call `runtime-update` with fields such as `{ "status": "READY" }` or `{ "status": "ACCEPTED" }`. A worker should not update the work item status directly; it should claim or use its own assignment, then update that assignment to `ACTIVE` or `COMPLETED` through the assignment runtime helper, which moves the work item to `IN_PROGRESS` or `IN_REVIEW`. Do not self-assign worker work to the lead member.

Before dispatching a work item by id, re-fetch it from agent-workspace and verify that it belongs to the current project, is still `READY`, and has not been cancelled, rejected, accepted, or superseded by a newer duplicate. Do not reuse ids from failed parse attempts or from items you just marked `CANCELLED`. Host dispatch responses are wrapped: read `assignment.id`, `assignment.status`, `assignment.assigneeUser`, `launchedRuntime`, and `idempotent`; do not assume top-level `assignmentId`, `runtimeId`, or `status` fields.

If `runtime-dispatch` times out, disconnects, or returns an unreadable response, do not immediately retry with `forceLaunchNew`. First inspect assignment/runtime state and the exact work item. If any open or recently completed assignment already exists for the same work item and role, treat the dispatch as pending or idempotently successful, poll/wake that assignment, and create a distinct work item only when you truly need another parallel agent.

When an assignment fails or times out, inspect its `contextPacket.localRunnerFailure`. If it includes `runtime.memberId`, `runtime.workspaceListEndpoint`, or `runtime.workspaceFiles`, a lead may use the public host workspace endpoints (`$AIFACTORY_API_BASE_URL/public/projects/...`) with the runtime bearer token to list/download the failed agent's local `/opt/data/workspace` files. Salvage useful sanitized artifacts into project shared files, then create the smallest revision/follow-up item needed; do not discard local evidence just because the assignment status is `FAILED`.

If a work item is unclear and needs owner clarification, add a visible work item comment through `runtime-comments` using JSON such as `{ "content": "@owner Please clarify ..." }` with the exact missing decision or resource. When the richer agent-workspace thread API is needed, also send `POST {base}/v1/projects/{projectId}/messages` with `messageType: "QUESTION"`, `threadRefType: "WORK_ITEM"`, `threadRefId`, and `mentions`/`targetMemberIds` for the owner project member so the owner receives an inbox mention.

When creating a work item from an active goal or feature group, include the available `goalId` and only include `featureId` when a real feature group exists. Feature groups are optional; for small or single-thread goals, link work items directly to the goal and leave `featureId` empty. `goalId` is optional only for truly unscoped items; if the item belongs to a known feature group whose record has a goal, keep the goal association so the board and detail views can show full goal context. `acceptanceCriteria` is a single string, not an array; use a newline-delimited numbered list when there are multiple criteria.
Use `READY` for work items that are dispatchable, `IN_PROGRESS` while execution is underway, `IN_REVIEW` after a worker handoff, and `ACCEPTED` as the completed/finished state. Use `CANCELLED` for duplicate or superseded work items. Do not use `COMPLETED`, `DONE`, or `CLOSED` for project work item status.

`PATCH /v1/projects/{projectId}/work-items/{workItemId}` requires `WORK_ITEM_STATUS_UPDATE` when changing only `status`; broader field updates require `WORK_ITEM_UPDATE`. `PROJECT_BOARD_READ` covers list/get, and `WORK_ITEM_CREATE` covers create.

For a missing owner-controlled resource, create a separate owner-owned work item instead of embedding the blocker inside a worker task. Use `POST $AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/work-items` with `Authorization: Bearer $AGENT_WORKSPACE_TOKEN` when the runtime has `WORK_ITEM_CREATE`; use a high priority, and put the request under `inputPacket.resourceRequest` with `key`, `label`, `description`, `isSecret`, `category`, `required`, `createTaskOnMissing`, and `value: ""`. The workspace service owner-assigns resource-request packets; if you set `ownerId` yourself, use the project owner user id, not the owner member id. Use one atomic resource item per project-global key, with stable lowercase snake_case keys. For a credential pair or A/B test-account set, create one item for each field/key that a downstream worker must read, such as email, password, bearer token, cookie, app id, and tenant id. Do not hide extra required keys in the prose of a single resource request. Do not infer a vendor, website, social network, API provider, platform-specific key set, or platform-specific skill from a generic resource key or generic task; keep labels and descriptions neutral unless the owner explicitly named that platform. Downstream work should depend on this item or wait until the corresponding `PROJECT_GLOBAL_<KEY>` is available.

`runtime.resume` returns the runtime-targeted inbox, active assignment summaries, linked thread summaries, and an event cursor. Workers should treat `ASSIGNMENT_DISPATCH` inbox items and assignment `contextPacket` values as their primary task packet.

## Project Memory And Globals

Project memory is owned by `agent-workspace`. Use it for durable, reusable facts, decisions, constraints, risks, open questions, and interface contracts that future agents should be able to retrieve. Do not write transient logs, long raw transcripts, secrets, task-local progress, or short-lived download URLs into memory.

Current task state belongs in goals, features, work items, artifacts, reviews, and handoffs. Memory is for cross-item continuity. For worker execution, the preferred flow is:

1. Lead/host dispatch includes relevant `memoryRefs` in the assignment packet.
2. Worker reads those refs before implementation and avoids broad memory search by default.
3. Worker proposes durable discoveries as `memoryCandidates` in handoff artifact metadata.
4. Reviewer approval persists accepted candidates to project memory.

Common memory types are `DECISION`, `CONSTRAINT`, `FACT`, `RISK`, `OPEN_QUESTION`, and `INTERFACE_CONTRACT`.

Shell helpers are available in this skill bundle:

```bash
. /opt/data/skills/agent-workspace/scripts/project-memory.sh
project-memory-search "api contract" INTERFACE_CONTRACT
project-memory-write DECISION "Use workspace storage" "Durable project files and memory are owned by agent-workspace."
project-global-list
```

Use `project-memory-write` only for explicit lead/reviewer/owner flows or narrow administrative writes. Routine worker discoveries should go through review-gated `memoryCandidates`.

If the helper script is not mounted, call the HTTP endpoints directly with `AGENT_WORKSPACE_BASE_URL`, `AGENT_WORKSPACE_PROJECT_ID`, and `AGENT_WORKSPACE_TOKEN` from `/opt/data/AGENT_WORKSPACE_RUNTIME.env`. Project file endpoints are `GET /v1/projects/{projectId}/files?prefix=...&recursive=...`, `GET /v1/projects/{projectId}/files/read?path=...`, `POST /v1/projects/{projectId}/files/write`, and `POST /v1/projects/{projectId}/files/upload`; avoid invented routes such as `/files/list`.

## Project Shared Resources

Project shared resource storage is owned by `agent-workspace`, not by a host product. Use it for files that project members and authorized agent runtimes should share: briefs, source documents, generated reports, datasets, review evidence, handoff bundles, submitted work item attachments, and other durable project context.

Access rules:

- Read requires the runtime token scope `PROJECT_FILE_READ`.
- Write, upload, and delete require `PROJECT_FILE_WRITE`.
- Keep all paths project-relative. Do not use leading `/`, `..`, or host filesystem paths.
- To bind file writes/uploads/deletes to the current item, pass `--work-item <workItemId>` to the helper command, or include `X-AgentCraft-Work-Item-Id: <workItemId>` / `workItemId` on direct API calls.
- Treat download URLs as short-lived convenience links. Do not paste them into durable memory as if they were permanent authority.
- If an assignment, output contract, or role prompt names a project shared path such as `待复审核/report.md`, `审核报告/final.md`, `reports/...`, or `deliverables/...`, create that file through `project-file-write`, `project-file-upload`, or the matching `/v1/projects/{projectId}/files/*` API. Do not substitute a container-local `/opt/data/workspace` file for a requested project shared file.
- Before reporting a project shared deliverable as complete, verify it with `project-file-list` or `project-file-read` at the exact project-relative path.
- When creating or updating work items, `acceptanceCriteria` is a single string and `outputContract` is a JSON object. Do not send `outputContract` as a plain string. Leave automated agent work items unowned until dispatch; set `ownerId` only for explicit human owner resource, approval, clarification, credential, or decision items.
- For long-running research, validation, or build work, deliver in bounded phases. Write the smallest useful evidence/handoff to project shared storage, verify the shared path, mark the assignment `COMPLETED`, and create or recommend a follow-up item for the next phase instead of working silently until the runtime timeout.

Shell helpers are available in this skill bundle. Source them before use:

```bash
. /opt/data/skills/agent-workspace/scripts/project-files.sh
project-file-list
project-file-search docs spec
project-file-read docs/brief.md
project-file-write --work-item "$WORK_ITEM_ID" notes/status.md ./local-status.md
project-file-upload --work-item "$WORK_ITEM_ID" ./report.pdf reports/report.pdf
project-folder-create "待审核"
project-file-download reports/report.pdf ./report.pdf
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
