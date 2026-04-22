# AgentCraft Project Platform V2 — Multi-Agent Collaboration Design

> Status: Draft v2
> Relation to v1: Non-breaking increment on top of `docs/project-platform-v1-design.md`. v1's 9 project tables stay as-is; v2 adds the missing coordination layer.

---

## 1. Motivation & Gap

v1 delivered the execution skeleton:
`Project → Goal → Feature → WorkItem → Assignment → Run → Artifact → Review → Memory`.

That is enough to **record** what happens, but it is not enough to **coordinate** a complex goal across multiple agents. Three missing layers are blocking real multi-agent collaboration:

1. **Handshake protocol** — context is not layered in a way agents can cleanly subscribe to. Everyone tends to pull the whole project history.
2. **Event closure** — there is no internal event bus, no external-system (GitHub CI/PR) feedback loop, and no way to **notify a human** when something needs approval.
3. **Concurrency coordination** — only one worker per work item can be modeled today; real projects race, pair, and run primary/backup.

A concrete pain: the platform currently has **no messaging channel at all**. The moment an agent needs a human to approve a goal change or unblock a budget, there is nowhere for that request to go. This document fixes that by introducing an IM gateway modeled directly after `hermes-agent/gateway/`.

## 2. Reference Blueprints

We borrow shapes from three places instead of porting any single methodology:

- **Open-source maintainer model** — maintainer / triager / contributor / reviewer / CI bot is the closest human analog to agent role play. Informs §4 (roles).
- **Linear / Shape Up** — flat issues, explicit cycles, strong ownership. Informs §9 (state machine).
- **Hermes `gateway/`** — `platforms/<platform>.py` + `channel_directory` + `delivery` + `pairing`. This is the direct blueprint for `agentcraft-im-gateway` in §10.

We explicitly **do not** port Scrum ceremonies. Agents run on events, not standups.

## 3. Core Collaboration Scenarios

Every abstraction in this document must be able to drive these four scenarios end-to-end. If it cannot, it is out of scope.

- **S1 — Complex goal dispatch**
  Owner writes a complex Goal → Lead decomposes into Features → Planner breaks out WorkItems with recommended skills → Lead assigns multiple Workers → each Worker submits a PR → Reviewer accepts → progress written back.

- **S2 — CI-failure self-heal**
  Worker submits PR → GitHub webhook says CI failed → `ExternalEvent` becomes a `ProjectEvent(CI_FAILED)` → WorkItem flips to `NEEDS_REVISION` → same Assignment is reactivated with a fresh context packet containing the failure log.

- **S3 — PM weekly report**
  PM agent reads `ProjectMetricSnapshot` on a schedule → produces a `PM_REPORT` artifact → flags stalled work items → creates a `REASSIGN` proposal → the proposal pings the Lead/Owner via IM gateway.

- **S4 — Goal change under human approval**
  Lead agent detects the Goal is mis-scoped → creates `GoalChangeProposal` → IM gateway pushes an approval card to the Owner → Owner clicks Approve → gateway calls back `proposal.resolve` → Goal is updated and downstream WorkItems are adjusted.

- **S5 — Cloud-runtime dispatch and re-entry**
  Lead decides a WorkItem needs more capacity → an external provisioning flow makes a cloud runtime available → runtime receives a project-scoped access grant and access token → an `ASSIGNMENT_DISPATCH` inbox item is created → the runtime is woken → it enters the project, reads inbox + assignment + L3 packet, starts work, later re-enters from inbox if CI or peer feedback arrives.

## 4. Roles & Contracts

Role is not a locked enum. It is `ProjectMember.role` **plus** a set of capability tags (see §6). Agents are matched to work by capability.

| Role | Input context it reads | Output contract | MCP tool subset | Triggered by / terminated by |
|---|---|---|---|---|
| **OWNER** (human) | Everything in project | Goal definitions, Proposal approvals | Read all; `goal.*`, `proposal.resolve` | Project create / project archive |
| **LEAD_AGENT** | Brief, Shared Memory, all Events | Goal/Feature/WorkItem plans, Assignments, Proposals | Read all; `goal.*`, `feature.*`, `workItem.*`, `assignment.*`, `proposal.create`, `notify.send` | Attached at project create; released at archive |
| **PLANNER_AGENT** (optional) | Brief, Shared Memory, target Goal | WorkItems + recommended skills + acceptance criteria | `goal.get`, `feature.create`, `workItem.create`, `memory.write` | Invoked by Lead for a Goal; terminates when Goal is READY |
| **WORKER_AGENT** | Own TaskPacket (L3), relevant Memory by reference | Runs, Artifacts, Handoff | `taskPacket.get`, `run.*`, `artifact.submit`, `handoff.submit`, `externalLink.create` | `assignment.claim` → `handoff.submit` / `assignment.release` |
| **REVIEWER_AGENT** | WorkItem + Artifact + acceptance criteria + relevant Memory | Review result + Memory entries | `review.request`, `review.resolve`, `memory.write` | `handoff.submit` triggers; terminates on `review.resolve` |
| **PM_AGENT** | MetricSnapshot, Event stream, Proposals | PM_REPORT artifacts, Reassign proposals | `metric.*`, `artifact.submit`, `proposal.create` | Schedule / explicit invocation |
| **INTEGRATOR_AGENT** | ExternalLink list, accepted WorkItems with merge intent | ExternalEvent (merge done / action triggered) | `external.*` | WorkItem ACCEPTED with `outputContract.autoMerge` |

Notes:
- One project has exactly one OWNER and one LEAD_AGENT at minimum.
- PLANNER and INTEGRATOR are optional — Lead can do both if no specialized agent is hired.
- "Firing" a role never deletes history; it ends the Assignment (see v1 §11).
- Every mutating action is attributed to both a logical member and, when applicable, a concrete execution runtime. Human sessions may omit runtime identity; cloud/local agents may not.

## 5. Four-Layer Context Abstraction

The single most important architectural rule: **agents do not share one giant project conversation**. Context is sliced into four layers, each with its own read/write rules.

| Layer | Writer | Reader | Write trigger | How agents reference it |
|---|---|---|---|---|
| **L1 Project Brief** | OWNER, LEAD (with proposal) | All members | Project create, explicit Brief update proposal | `project.get → brief` |
| **L2 Shared Memory** | Any role that writes `memory.write`; auto-extracted on Review APPROVED | All members (filterable by type) | Review APPROVED; explicit decision record; accepted Handoff | `memory.search(filter)` |
| **L3 Task Packet** | LEAD / PLANNER when creating an Assignment | The Assignment's assignee only | Assignment creation (snapshot taken) | `taskPacket.get(assignmentId)` |
| **L4 Handoff Package** | WORKER at end of Assignment | Reviewer, Lead, later Workers inheriting the WorkItem | `handoff.submit` | Read as an Artifact of `artifactType=HANDOFF` |

Key property: **L3 is generated by Lead/Planner, not assembled by the Worker itself.** This enforces the minimality rule — the worker receives exactly the slice it needs, not the whole project.

Suggested minimum of an L3 TaskPacket:
- objective (derived from WorkItem)
- acceptance criteria
- references to relevant Memory entries (by id, not by copying content)
- upstream dependency summaries (not full artifacts)
- suggested skills / tool hints
- output contract (what shape of Artifact/Handoff must come back)
- packet metadata: `packetVersion`, `generatedAt`, `generatedFromEventSeq`, `visibilityScope`, `state` (`ACTIVE | STALE | SUPERSEDED`), `rebaseOfPacketId?`

TaskPacket lifecycle rules:
- L3 is versioned. Workers should treat the current active packet as the only writable execution basis.
- Any material assignment-context change emits `TASK_PACKET_STALE` and may generate a replacement packet:
  - `review.resolve(CHANGES_REQUESTED)`
  - `ExternalEvent(ci_failed)`
  - dependency completed / dependency invalidated
  - scope-affecting `goal.update` / `feature.update` / `workItem.update`
  - access-grant or permission downgrade
- Workers may still read stale packets for audit, but `run.start`, `artifact.submit`, and `handoff.submit` should reject if the caller is bound only to a stale packet and a fresh packet exists.
- Rebase is explicit: the platform emits `TASK_PACKET_REBASED`, links the new packet to `rebaseOfPacketId`, and writes an inbox item if human or agent attention is required.

Suggested minimum of an L4 Handoff:
- summary of what was done
- what changed (files, endpoints, schemas, external links)
- what remains
- blockers
- risks
- recommended next step
- evidence links (PR URL, test report, logs)

## 6. Domain Model Increments (vs v1)

All additions are new tables. Nothing in v1 needs to break.

### 6.1 `ProjectMemberCapability`
Attach one or more capability tags to a `ProjectMember`. Lead uses tags to pick assignees.

Key fields: `memberId`, `capability` (e.g. `frontend`, `typescript`, `review.code`, `pm`, `integrator.github`), `level` (`novice|competent|expert`), `source` (`self_declared|verified_by_review|verified_by_metric`).

### 6.2 `ProjectProposal`
Single carrier for every human-approval gate. Replaces ad-hoc approval fields sprinkled elsewhere.

Key fields: `projectId`, `type` (`GOAL_DEFINITION | GOAL_CHANGE | GOAL_CLOSE | GOAL_REOPEN | BUDGET_INCREASE | REASSIGN | SCOPE_CHANGE | MEMBER_INVITE`), `payload` (Json), `createdByUserId`, `approverUserIds` (array), `status` (`PENDING | APPROVED | REJECTED | EXPIRED | ESCALATED`), `resolvedByUserId`, `resolvedNote`, `reason`, `expiresAt`, timestamps.

### 6.3 `ProjectEvent`
Internal event bus. Everything interesting in the project lands a row here. Agents subscribe via `event.list(sinceEventId)`.

Key fields: `projectId`, `seq` (monotonic per project, used as cursor), `type` (e.g. `WORK_ITEM_STATUS_CHANGED`, `RUN_FINISHED`, `REVIEW_RESOLVED`, `MEMORY_WRITTEN`, `PROPOSAL_CREATED`, `PROPOSAL_RESOLVED`, `EXTERNAL_EVENT_INGESTED`, `GOAL_CREATED`, `GOAL_CLOSED`, `ASSIGNMENT_RELEASED`), `refType`, `refId`, `payload` (Json), `actorUserId`, `createdAt`.

### 6.4 `ExternalLink`
Binds a v1 entity (usually `WorkItem` or `Artifact`) to an external object.

Key fields: `projectId`, `refType` (`WORK_ITEM | ARTIFACT`), `refId`, `externalType` (`GITHUB_ISSUE | GITHUB_PR | GITHUB_COMMIT | GITHUB_CI_RUN`), `externalId`, `externalUrl`, `metadata` (Json), `createdAt`.

### 6.5 `ExternalEvent`
Incoming events from external systems. Normalized so the internal bus does not care where they came from.

Key fields: `projectId`, `source` (`github | gitlab | custom`), `externalEventId` (idempotency), `kind` (`pr_opened | pr_merged | ci_failed | ci_succeeded | issue_commented | …`), `payload`, `linkedWorkItemId?`, `mappedEventId?` (FK → `ProjectEvent`), `receivedAt`.

Ingestion rule: every `ExternalEvent` that maps cleanly produces exactly one `ProjectEvent`. Unmapped events stay as raw rows for audit.

### 6.6 `ProjectMetricSnapshot`
Periodic rollup for the PM agent. Cheaper and more reproducible than computing live on each read.

Key fields: `projectId`, `periodKey` (e.g. `2026-W16`), `wipCount`, `cycleTimeP50Hours`, `cycleTimeP90Hours`, `reviewPassRate`, `bugRate`, `budgetConsumed`, `budgetRemaining`, `membersStats` (Json: per-member done/open/reject counts), `computedAt`.

### 6.7 `NotificationChannel`
One user can bind multiple IM accounts. `agentcraft-im-gateway` owns this table; `aifactory-server` only reads.

Key fields: `userId`, `platform` (`email | dingtalk | slack | mattermost | matrix | telegram | discord | homeassistant`), `externalAccountId`, `displayName`, `priority` (lower = try first), `enabled`, `verifiedAt`, `pairingCode?`, `pairingExpiresAt?`, timestamps.

### 6.8 `NotificationDelivery`
Audit + idempotency for each send.

Key fields: `refType` (`PROPOSAL | EVENT | REPORT`), `refId`, `userId`, `channelId`, `platform`, `templateKey`, `status` (`QUEUED | SENT | FAILED | ACKED | REPLIED`), `attempts`, `lastError?`, `messageExternalId?` (platform's own id for the pushed message, used for reply correlation), `replyPayload?`, `createdAt`, `updatedAt`.

### 6.9 `AgentRuntime`
Represents a concrete execution identity for an agent currently able to act in a project.

Key fields: `provider` (`local | agentcraft_cloud | openai | anthropic | custom`), `framework` (`claude_code | codex | hermes | unknown | other`), `model`, `status` (`PROVISIONING | READY | ACTIVE | IDLE | PAUSED | REVOKED | FAILED`), `wakeEndpoint?`, `lastSeenAt`, `metadata` (Json).

`framework` is reported by the joining agent/runtime during registration and is intended for:

- board visibility
- debugging collaboration differences between agent stacks
- runtime compatibility policy

### 6.10 `ProjectAccessGrant`
Persistent authorization grant that binds a `ProjectMember` to a concrete runtime and scoped permissions.

Key fields: `projectId`, `memberId`, `agentRuntimeId`, `grantType` (`HUMAN_SESSION | LOCAL_AGENT | CLOUD_AGENT | SERVICE_AGENT`), `scopes` (Json), `skillBundleRefs` (array), `status` (`PENDING | ACTIVE | EXPIRED | REVOKED`), `issuedAt`, `expiresAt`, `revokedAt?`, `revokedReason?`.

### 6.11 `ProjectAccessToken`
Not a table by default, but a signed short-lived token minted from an active `ProjectAccessGrant`.

Suggested token payload: `projectId`, `memberId`, `agentRuntimeId`, `role`, `capabilityTags`, `allowedToolScopes`, `skillBundleRefs`, `participantCursorStart`, `expiresAt`.

### 6.12 `ProjectInboxItem`
Project-local actionable queue for a member or runtime.

Key fields: `projectId`, `targetMemberId`, `targetRuntimeId?`, `sourceMemberId?`, `kind` (`ASSIGNMENT_DISPATCH | REVIEW_REQUEST | REWORK_REQUEST | CI_INCIDENT | BLOCKER | PEER_MESSAGE | MENTION | PROPOSAL | DEPENDENCY_UNBLOCKED | TOKEN_EXPIRING | ACCESS_REVOKED`), `priority` (`LOW | NORMAL | HIGH | URGENT`), `status` (`UNREAD | READ | ACKED | DONE | EXPIRED | CANCELLED`), `wakeHint` (`NONE | NEXT_ENTRY | SOFT_WAKE | HARD_WAKE`), `refType`, `refId`, `threadRefType?`, `threadRefId?`, `summary`, `details?`, `createdAt`, `readAt?`, `ackedAt?`, `resolvedAt?`.

`PEER_MESSAGE` means "there is substantive coordination content to respond to."
`MENTION` means "attention routing to a person or runtime," and may be omitted if a stronger inbox kind already exists for the same target and thread.

### 6.13 `ProjectMessage`
Lightweight project-local communication, distinct from reviews, handoffs, and proposals.

Key fields: `projectId`, `threadRefType`, `threadRefId`, `senderMemberId`, `senderRuntimeId?`, `targetType` (`MEMBER | ROLE | ASSIGNMENT | WORK_ITEM | THREAD`), `targetRef`, `messageType` (`NOTE | QUESTION | ALERT | REPLY | STATUS_UPDATE`), `content`, `requiresAck`, `metadata?`, `createdAt`.

### 6.14 `ProjectThread`
Stable coordination container for review, blocker, CI, proposal, or work-item discussion.

Key fields: `projectId`, `threadType` (`WORK_ITEM | REVIEW | CI_INCIDENT | PROPOSAL | BLOCKER`), `refType`, `refId`, `title`, `status`, `createdAt`, `closedAt?`.

### 6.15 `ParticipantPresence`
Tracks whether a human session or agent runtime is currently reachable for wake or re-entry.

Key fields: `projectId`, `memberId`, `runtimeId?`, `presence` (`OFFLINE | IDLE | ACTIVE | SLEEPING | UNREACHABLE`), `lastSeenAt`, `lastHeartbeatAt?`, `supportsHardWake`, `wakeFailureCount`.

### 6.16 Member panel expectations

The project member list should expose not only logical members, but also their active execution identity and current grant state.

Recommended member-list fields:

- member id
- display name
- role
- capability tags
- active runtime id
- runtime framework (`claude_code | codex | hermes | unknown | other`)
- runtime provider / model
- active access-grant scopes
- access-grant issued time
- access-grant expiry time
- presence / last heartbeat

This is primarily a board and operator concern, but the schema must support it directly rather than relying on ad hoc joins later.

## 7. Goal Lifecycle

Goals are the top of the work tree, so their lifecycle is the most sensitive.

### 7.1 Operations

- **`createGoal(projectId, title, description, priority)`**
  - Lead or Owner may call.
  - If this is the **first goal** of the project and the caller is an agent, it lands as `ProjectProposal(type=GOAL_DEFINITION)` for Owner approval. Subsequent goal creations by Lead are auto (configurable per project in `Project.settings.autonomy.goalCreate`).
  - Emits `GOAL_CREATED` event.

- **`updateGoal(goalId, patch)`**
  - Safe fields (`priority`, `sortOrder`, cosmetic `title`) go through directly.
  - Semantic changes (substantive `description` rewrite, changing `status` outside the closure path) route to `ProjectProposal(type=GOAL_CHANGE)`.
  - Emits `GOAL_UPDATED`.

- **`closeGoal(goalId, reason, cascade=true)`**
  - If `cascade=true` and there are `IN_PROGRESS` descendants **above a threshold** (default: > 3 in-progress WorkItems, configurable), it routes through `ProjectProposal(type=GOAL_CLOSE)` and waits. Otherwise auto-executes.
  - Cascade steps, performed in a single transaction per project:
    1. Child `ProjectFeature` not in `DONE` → `CANCELLED`.
    2. Child `ProjectWorkItem` not in `ACCEPTED` → `CANCELLED`.
    3. `ProjectAssignment` in `ACTIVE|PAUSED|PROPOSED` under those WorkItems → `RELEASED` with `resolvedNote = reason`.
    4. `ProjectRun` in `QUEUED|RUNNING` → `CANCELLED` (tell the runtime to cancel; log cost up to cancel).
    5. Write a `ProjectMemory(type=DECISION, title="Goal closed: <title>")` snapshotting the reason.
    6. Emit `GOAL_CLOSED` with `payload.affected = {features, workItems, assignments, runs}`.
    7. `agentcraft-im-gateway` broadcasts to the Lead and all member agents with active assignments so they can stop work cleanly.
  - **Code already merged to external repos is not rolled back.** The close operation records it in the memory entry; any rollback is a new Goal.

- **`reopenGoal(goalId, reason)`**
  - Always a proposal. Only OWNER may approve. Lead cannot auto-reopen even with full autonomy.

### 7.2 Status transitions

```
OPEN ─► IN_PROGRESS ─► DONE
  │          │
  │          ├─► BLOCKED ─► IN_PROGRESS
  └──────────┴─► CANCELLED   (via closeGoal)
                    │
                    └─► OPEN (via reopenGoal, proposal only)
```

## 8. Concurrent Assignment Strategy

One WorkItem can have multiple `ACTIVE` assignments. That is by design — projects race and pair. The v1 schema already allows it (no unique constraint on `workItemId`); v2 adds coordination.

### 8.1 Concurrency modes

`ProjectWorkItem.concurrencyMode`:

| Mode | Meaning | Winning rule |
|---|---|---|
| `SINGLE` | Default. Only one ACTIVE assignment allowed. | `assignment.claim` rejects if an ACTIVE exists. |
| `RACE` | Multiple Workers compete. | First Handoff to reach `ACCEPTED` wins; other assignments auto-`RELEASED` with `resolvedNote="lost_race"`. Losers' Runs are kept for post-mortem. |
| `MULTI_ROLE` | Different roles run in parallel. | Worker + Reviewer (or Planner + Worker) can hold ACTIVE slots simultaneously. One ACTIVE per `role`. |
| `PRIMARY_BACKUP` | Primary does the work; backup warms up. | Only primary's Handoff triggers review. If primary Assignment moves to `FAILED` or times out, backup is promoted. |

Defaults:
- `workType=REVIEW` → default `MULTI_ROLE`.
- `workType=RESEARCH` → Lead may choose `RACE`.
- Everything else → `SINGLE`.

### 8.2 Guarantees
- **Isolated packets.** Every Assignment takes its own L3 snapshot at create time. Concurrent Workers do not share a scratchpad.
- **Single Handoff target.** When one Handoff is accepted, the WorkItem moves to `ACCEPTED` and open Assignments are closed by the winning rule.
- **Cost visibility.** All Runs are kept; PM snapshot reports total cost including losing participants.

### 8.3 claim semantics

```
workItem.concurrencyMode = SINGLE        → claim fails if any ACTIVE exists
workItem.concurrencyMode = RACE          → claim succeeds up to an optional cap (Project.settings.race.maxParticipants)
workItem.concurrencyMode = MULTI_ROLE    → claim fails if an ACTIVE with same role exists
workItem.concurrencyMode = PRIMARY_BACKUP → first claim becomes primary; next claim becomes backup; third rejected
```

### 8.4 Collaboration and salvage rules

Concurrency is not only about winning; it must define how participants coordinate while a race or backup setup is active.

- Every WorkItem in `RACE` or `PRIMARY_BACKUP` mode gets a shared coordination thread by default.
- Any participant may raise a blocker or peer note into that thread; all active assignees on the WorkItem can read it.
- Losing workers may submit a final `HANDOFF` with `metadata.salvage=true`. Lead, winner, or promoted backup may reference that handoff instead of discarding the result.
- Merge-conflict ownership belongs to the current winner or promoted primary. Non-winning assignees may propose fixes through message or salvage handoff, but they may not continue mutating the main execution line unless re-assigned.
- `PRIMARY_BACKUP` promotion writes both a `ProjectEvent(BACKUP_PROMOTED)` and a `ProjectInboxItem(kind=ASSIGNMENT_DISPATCH)` so the promoted backup re-enters through the same path as a newly dispatched worker.

## 9. State Machine & Workflow

### 9.1 WorkItem edges added vs v1

- `IN_REVIEW → NEEDS_REVISION` reuses the **same Assignment** (reactivates it) instead of creating a new WorkItem. A fresh L3 packet is generated embedding the review note and evidence.
- `ACCEPTED` inspects `outputContract.autoMerge` / `outputContract.postActions`; if set, emits `INTEGRATE_REQUESTED` event that an INTEGRATOR agent (or MCP hook) can pick up.
- Any assignment-affecting event that materially changes execution context emits `TASK_PACKET_STALE`; if auto-rebase is possible, the platform also emits `TASK_PACKET_REBASED` and writes an inbox item for the assignee.
- `CI_FAILED`, `PEER_ALERT(requiresAck=true)`, `BLOCKER`, and `ACCESS_REVOKED` should all be modeled as project-local inbox-producing events, not only as event-stream rows.

### 9.2 Human-approval gates (the full list)

Every item in this list is routed through `ProjectProposal` and triggers an IM notification:

1. First Goal definition of a project, if authored by an agent.
2. `closeGoal` where the cascade would cancel more than N in-progress WorkItems.
3. `reopenGoal` — always.
4. Cumulative project spend exceeding `Project.budgetAmount * threshold` (default 80%).
5. Review REJECTED twice in a row on the same WorkItem.
6. Merge to a protected branch (decided by `ExternalLink.metadata.protected=true`).
7. Scope-change proposals (a WorkItem / Feature outside the closest Goal).
8. Member invite in a `private` project.

## 10. Notification Path: `agentcraft-im-gateway`

Before anything leaves the system, coordination is written locally as `ProjectEvent`, `ProjectInboxItem`, `ProjectMessage`, and `ParticipantPresence`. The IM gateway is for **external human delivery**, not for replacing the project-local coordination layer used by agents.

### 10.1 Why a separate service

- IM integration is IO-heavy, platform-specific, and easy to block. Isolating it keeps `aifactory-server` fast and testable.
- We reuse Hermes's proven shape: per-platform adapters, a channel directory, a delivery layer with retry and idempotency, and a pairing flow for binding a human to an external account.

### 10.2 Architecture

```
                 ┌──────────────────────┐
                 │   aifactory-server   │
                 └─────────┬────────────┘
                           │ POST /notify
                           ▼
                 ┌──────────────────────┐
                 │ agentcraft-im-gateway│
                 │  - channel_directory │
                 │  - delivery (retry)  │
                 │  - pairing           │
                 │  - platforms/*       │
                 └─────────┬────────────┘
             platform SDK  │   webhooks: /inbound/:platform
                           ▼
         ┌─────────────────────────────────────────┐
         │ email | dingtalk | slack | mattermost   │
         │ matrix | telegram | discord | ...       │
         └─────────────────────────────────────────┘
                           │  user reply (/approve, /reject)
                           ▼
              POST /api/projects/:id/proposals/:proposalId/resolve
                      (aifactory-server)
```

### 10.3 Triggers from the business side

- Every `ProjectProposal` creation fans out to its `approverUserIds` via the gateway.
- High-priority `ProjectEvent` types (`CI_FAILED` streak, budget warning, review REJECTED ×2) fan out to Owner + Lead.
- PM `PM_REPORT` artifacts are broadcast to project watchers.
- Agent-facing coordination first creates `ProjectInboxItem` and `ProjectMessage` rows; only human-facing items are then mirrored to the IM gateway.
- Cloud-worker dispatch never goes directly through human IM. It writes `ASSIGNMENT_DISPATCH`, updates `ParticipantPresence`, and attempts a runtime wake against `AgentRuntime.wakeEndpoint`.

### 10.4 Gateway API surface (called by `aifactory-server`)

- `POST /notify`
  Body: `{ userId, templateKey, params, refType, refId, priority }`
  Behavior: look up `NotificationChannel` rows for `userId`, pick by `priority` + `enabled`, enqueue a `NotificationDelivery` per fallback target, retry with backoff.

- `POST /notify/broadcast`
  Body: `{ projectId, roleFilter?, templateKey, params, refType, refId, priority }`
  Behavior: resolve project members, filter by role, then per-user flow.

- `GET /channels/:userId`

- `POST /channels/pair`
  Body: `{ userId, platform }` → returns `{ pairingCode, expiresAt, instructionsUrl }`.

- `POST /inbound/:platform` — platform webhook (signed).

### 10.5 Approval reply flow

1. A proposal notification renders a message with two buttons / inline commands:
   - `/approve <proposalId>`
   - `/reject <proposalId> <reason>`
   (Plain-text commands are the fallback for platforms that do not support buttons.)
2. The platform posts the user's reply to `POST /inbound/:platform`. The gateway verifies the signature, locates the matching `NotificationDelivery` via `messageExternalId`, and resolves the originating user via `NotificationChannel.externalAccountId`.
3. Gateway calls `POST /api/projects/:id/proposals/:proposalId/resolve` on `aifactory-server` with `{ decision, note, actingUserId }`.
4. `aifactory-server` writes `ProjectProposal.status`, fires `PROPOSAL_RESOLVED` event, performs the queued action (e.g. run `closeGoal` cascade if the proposal was `GOAL_CLOSE`), and records a `NotificationDelivery` with `status=REPLIED`.

### 10.6 Idempotency & security

- `NotificationDelivery.messageExternalId` is unique per platform; replies are deduped by it.
- Every inbound webhook must carry a platform-specific signature; unverified requests are dropped.
- Pairing uses a one-time code bound to `userId` with a short TTL. The code is read back in the target platform by the user to prove control of the account.
- `aifactory-server → gateway` calls go over an internal token; the gateway never exposes user PII outside its DB.

### 10.7 Platform rollout

- **Tier 1 (launch)**: `email` (must-have), plus pick one of `dingtalk` / `slack` depending on the deploy region.
- **Tier 2**: `matrix`, `telegram`, `mattermost`.
- **Out of scope for v2**: `sms`, `whatsapp`, voice.

## 11. Agent Interface: MCP Tools (Full Signatures)

All tools use pseudo-TypeScript for the contract. `auto | proposal` marks whether the write goes through directly under the default autonomy policy. Every tool implicitly requires the caller to be a project member; additional role constraints are listed.

Shared types (abbreviated):

```ts
type ID = string;
type ISODate = string;
type Json = Record<string, unknown>;
type VisibilityScope = "ASSIGNMENT_LINKED" | "THREAD_LINKED" | "PROJECT_WIDE";

interface Pagination { limit?: number; cursor?: string }
interface Page<T> { items: T[]; nextCursor?: string }
```

Execution identity rule:

- Every mutating tool call is evaluated as `{ memberId, runtimeId?, accessGrantId? }`.
- Human sessions may omit `runtimeId`.
- Ephemeral cloud workers are not issued `PROJECT_WIDE` read scope by default.

Visibility rule:

- `ASSIGNMENT_LINKED` scope: assignment, task packet, linked dependencies, linked artifacts, linked memory.
- `THREAD_LINKED` scope: messages, inbox items, thread-local events, linked review / blocker / CI discussion.
- `PROJECT_WIDE` scope: project dashboard, goal and feature listings, full event stream, metrics, all members.
- Worker and reviewer defaults are `ASSIGNMENT_LINKED` + `THREAD_LINKED`. `PROJECT_WIDE` must be explicitly granted.

`PROJECT_WIDE` grant conditions:

- default allow:
  - OWNER
  - LEAD
  - PM
  - PLANNER when actively planning project structure
- conditional allow:
  - INTEGRATOR when merge or release coordination requires project-wide visibility
  - REVIEWER only if the review role is explicitly configured as cross-project / system reviewer
- deny by default:
  - ephemeral cloud workers
  - ordinary workers
  - backup participants in `PRIMARY_BACKUP`
  - race participants in `RACE`

Grant policy:

- `PROJECT_WIDE` should be time-bounded where possible
- it should be attached to an access grant, not inferred forever from role history
- grant reason should be auditable (`planning`, `pm_report`, `integration`, `system_review`, etc.)
- if an assignment can be executed with `ASSIGNMENT_LINKED + THREAD_LINKED`, do not grant `PROJECT_WIDE`
- revoking `PROJECT_WIDE` should mark any packet generated under that broader visibility as stale if the packet exposed data outside the remaining scopes

### 11.1 Read tools (all roles, filtered by membership)

```ts
project.getBrief(input: { projectId: ID }): ProjectBrief
// role: any member

project.get(input: { projectId: ID }): Project
// role: OWNER | LEAD | PLANNER | PM | INTEGRATOR | any member explicitly granted PROJECT_WIDE scope

project.listMembers(input: { projectId: ID }): Member[]
// role: OWNER | LEAD | PLANNER | PM | any member explicitly granted PROJECT_WIDE scope
// returns member profile + active runtime summary + active grant summary

goal.list(input: { projectId: ID; status?: GoalStatus }): Goal[]
// role: PROJECT_WIDE scope only

goal.get(input: { goalId: ID }): Goal
// role: PROJECT_WIDE scope only, or ASSIGNMENT_LINKED if the goal is referenced by the caller's active packet

feature.list(input: { projectId?: ID; goalId?: ID; status?: FeatureStatus }): Feature[]
// role: PROJECT_WIDE scope only

workItem.list(input: {
  projectId: ID;
  status?: WorkItemStatus;
  assigneeId?: ID;
  goalId?: ID;
  featureId?: ID;
} & Pagination): Page<WorkItem>
// role: PROJECT_WIDE scope only; workers use assignment-linked views by default

workItem.get(input: { workItemId: ID }): WorkItem & {
  dependencies: WorkItem[];
  recentEvents: ProjectEvent[];
}
// role: any member if the item is linked to caller's assignment/thread scope; otherwise PROJECT_WIDE scope only

memory.search(input: {
  projectId: ID;
  type?: MemoryType;
  query?: string;
  limit?: number;
}): Memory[]
// role: any member, but results are scope-filtered; PROJECT_WIDE memory search requires PROJECT_WIDE scope

taskPacket.get(input: { assignmentId: ID }): TaskPacket
// role: WORKER (the assignee) | LEAD | REVIEWER

inbox.list(input: {
  projectId: ID;
  status?: "UNREAD" | "READ" | "ACKED";
  limit?: number;
}): ProjectInboxItem[]
// role: own-member scope only

message.list(input: {
  projectId: ID;
  threadRefType?: string;
  threadRefId?: string;
  sinceId?: ID;
  limit?: number;
}): ProjectMessage[]
// role: any member with thread visibility

event.list(input: {
  projectId: ID;
  sinceSeq?: number;
  types?: EventType[];
  limit?: number;
}): { events: ProjectEvent[]; lastSeq: number }
// role: PROJECT_WIDE scope only; thread-local event views are returned through linked `workItem.get`, `message.list`, and `runtime.resumeProject`

metric.getSnapshot(input: { projectId: ID; periodKey?: string }): MetricSnapshot
// role: PROJECT_WIDE scope only

externalLink.list(input: { workItemId: ID }): ExternalLink[]
// role: any member if linked to active assignment/thread; otherwise PROJECT_WIDE scope only

runtime.resumeProject(input: { projectId: ID }): {
  inbox: ProjectInboxItem[];
  assignments: Assignment[];
  unreadEvents: ProjectEvent[];
  taskPackets: TaskPacket[];
}
// role: any active runtime or member session; returns scope-filtered data in re-entry order
```

### 11.2 Planning tools (LEAD / PLANNER)

```ts
goal.create(input: {
  projectId: ID;
  title: string;
  description?: string;
  priority?: number;
}): Goal
// role: LEAD | OWNER
// mode: proposal if first goal authored by agent; else auto

goal.update(input: { goalId: ID; patch: Partial<GoalPatch> }): Goal
// role: LEAD | OWNER
// mode: auto for safe fields (priority, sortOrder, title); proposal otherwise

goal.close(input: {
  goalId: ID;
  reason: string;
  cascade?: boolean; // default true
}): {
  goal: Goal;
  affected: { features: ID[]; workItems: ID[]; assignments: ID[]; runs: ID[] };
}
// role: LEAD | OWNER
// mode: proposal if inProgressDescendants > threshold; else auto

goal.reopen(input: { goalId: ID; reason: string }): Goal
// role: OWNER only (LEAD may call, but always routes to proposal with OWNER approver)
// mode: proposal

feature.create(input: {
  projectId: ID;
  goalId?: ID;
  title: string;
  description?: string;
  spec?: Json;
  priority?: number;
}): Feature
// role: LEAD | PLANNER
// mode: auto

feature.update(input: { featureId: ID; patch: Partial<FeaturePatch> }): Feature
feature.close(input: { featureId: ID; reason: string }): Feature
// role: LEAD | PLANNER
// mode: auto

workItem.create(input: {
  projectId: ID;
  goalId?: ID;
  featureId?: ID;
  parentWorkItemId?: ID;
  title: string;
  workType: string;
  description?: string;
  scopeBrief?: string;
  acceptanceCriteria?: string;
  outputContract?: Json;
  dependsOn?: ID[];
  concurrencyMode?: "SINGLE" | "RACE" | "MULTI_ROLE" | "PRIMARY_BACKUP";
  priority?: number;
  dueAt?: ISODate;
}): WorkItem
// role: LEAD | PLANNER
// mode: auto; proposal if inferred as scope-change

workItem.update(input: { workItemId: ID; patch: Partial<WorkItemPatch> }): WorkItem
workItem.cancel(input: { workItemId: ID; reason: string }): WorkItem
workItem.markReady(input: { workItemId: ID }): WorkItem
// role: LEAD | PLANNER
// mode: auto
```

### 11.3 Dispatch tools (LEAD)

```ts
runtime.provisionCloudWorker(input: {
  projectId: ID;
  capabilityTags: string[];
  preferredModel?: string;
  skillBundleRefs?: string[];
}): {
  memberId: ID;
  runtimeId: ID;
  accessGrantId: ID;
}
// role: LEAD | OWNER
// mode: auto or proposal depending on higher-level product policy; pricing and marketplace economics are out of scope for this document

accessGrant.issue(input: {
  projectId: ID;
  memberId: ID;
  runtimeId: ID;
  scopes: VisibilityScope[];
  skillBundleRefs?: string[];
  expiresAt?: ISODate;
}): { accessGrantId: ID; token: string }
// role: LEAD | OWNER
// mode: auto

runtime.register(input: {
  projectId: ID;
  memberId: ID;
  framework: "claude_code" | "codex" | "hermes" | "unknown" | "other";
  provider: "local" | "agentcraft_cloud" | "openai" | "anthropic" | "custom";
  model?: string;
  metadata?: Json;
}): { runtimeId: ID }
// role: joining member session, LEAD, or system provisioning path
// mode: auto

accessGrant.revoke(input: {
  accessGrantId: ID;
  reason: string;
}): void
// role: LEAD | OWNER
// mode: auto; writes ACCESS_REVOKED inbox item and invalidates stale packets

assignment.create(input: {
  workItemId: ID;
  assigneeMemberId: ID;
  targetRuntimeId?: ID;
  role: "WORKER" | "REVIEWER" | "PLANNER" | "INTEGRATOR";
  objective: string;
  contextPacket: TaskPacket;
  requiredScopes?: VisibilityScope[];
  skillBundleRefs?: string[];
  concurrencyModeOverride?: WorkItemConcurrencyMode;
}): Assignment
// role: LEAD
// mode: auto; rejects if it violates the WorkItem's concurrencyMode; creates `ASSIGNMENT_DISPATCH` inbox item and optional runtime wake

assignment.pause(input: { assignmentId: ID; reason?: string }): Assignment
assignment.release(input: { assignmentId: ID; reason?: string }): Assignment
assignment.restart(input: { assignmentId: ID }): Assignment
// role: LEAD
// mode: auto

member.invite(input: {
  projectId: ID;
  userId: ID;
  role: string;
  capabilities?: string[];
}): Member
// role: LEAD | OWNER
// mode: auto if project.visibility="public"; proposal if "private"

member.remove(input: { projectId: ID; userId: ID; reason?: string }): void
// role: LEAD | OWNER
// mode: auto (releases the user's active assignments)
```

### 11.4 Execution tools (WORKER)

```ts
assignment.claim(input: {
  workItemId: ID;
  role?: "WORKER" | "REVIEWER" | "PLANNER" | "INTEGRATOR";
}): Assignment
// role: WORKER (or matching role)
// mode: auto; respects concurrencyMode per §8.3

run.start(input: {
  assignmentId: ID;
  instruction: string;
  contextSnapshot?: Json;
  runType?: string;
}): Run
// role: assignee of the assignment

run.log(input: {
  runId: ID;
  level?: "debug" | "info" | "warn" | "error";
  message: string;
  metadata?: Json;
}): void

run.finish(input: {
  runId: ID;
  status: "SUCCEEDED" | "FAILED" | "CANCELLED";
  resultSummary?: string;
  costInfo?: Json;
}): Run

artifact.submit(input: {
  workItemId: ID;
  assignmentId?: ID;
  runId?: ID;
  artifactType: string;
  title?: string;
  content?: string;
  url?: string;
  metadata?: Json;
}): Artifact
// role: WORKER | REVIEWER | PM_AGENT | LEAD

handoff.submit(input: {
  assignmentId: ID;
  summary: string;
  changes: string;
  remaining?: string;
  blockers?: string;
  risks?: string;
  nextStep?: string;
  evidence: Array<{ kind: string; url?: string; refArtifactId?: ID }>;
}): Artifact  // artifactType = "HANDOFF"
// role: WORKER
// side-effect: moves WorkItem to IN_REVIEW and calls review.request implicitly

externalLink.create(input: {
  workItemId: ID;
  externalType: "GITHUB_ISSUE" | "GITHUB_PR" | "GITHUB_COMMIT" | "GITHUB_CI_RUN";
  externalId: string;
  externalUrl: string;
  metadata?: Json;
}): ExternalLink
// role: WORKER | INTEGRATOR
```

### 11.5 Review tools (REVIEWER)

```ts
review.request(input: {
  workItemId: ID;
  assignmentId?: ID;
  artifactId?: ID;
  reviewerType: "agent" | "human" | "rule";
  checklist?: Json;
}): Review
// role: LEAD | WORKER (auto-called by handoff.submit)

review.resolve(input: {
  reviewId: ID;
  status: "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";
  note?: string;
  checklistResult?: Json;
}): Review
// role: REVIEWER
// mode: auto; APPROVED triggers Memory extraction; REJECTED twice on same WorkItem triggers proposal

memory.write(input: {
  projectId: ID;
  memoryType: "DECISION" | "CONSTRAINT" | "FACT" | "RISK" | "OPEN_QUESTION" | "INTERFACE_CONTRACT";
  title?: string;
  content: string;
  summary?: string;
  sourceArtifactId?: ID;
}): Memory
// role: any member with write cap
// mode: auto
```

### 11.6 PM tools (PM_AGENT)

```ts
metric.computeSnapshot(input: { projectId: ID; periodKey?: string }): MetricSnapshot
// role: PM_AGENT | LEAD
// mode: auto

// artifact.submit with artifactType="PM_REPORT" — see §11.4

proposal.create(input: {
  projectId: ID;
  type: "REASSIGN" | "SCOPE_CHANGE" | "BUDGET_INCREASE";
  payload: Json;
  approverUserIds: ID[];
  reason: string;
  expiresAt?: ISODate;
}): Proposal
// role: PM_AGENT | LEAD
// mode: always creates a proposal; routes to IM gateway
```

### 11.7 Integrator tools (INTEGRATOR_AGENT)

```ts
external.mergePR(input: {
  externalLinkId: ID;
  strategy?: "merge" | "squash" | "rebase";
}): ExternalEvent
// role: INTEGRATOR
// mode: proposal if target branch is protected; else auto

external.triggerAction(input: {
  externalLinkId: ID;
  action: string;
  params?: Json;
}): ExternalEvent
// role: INTEGRATOR
// mode: auto for non-destructive actions

// externalEvent.ingest — internal webhook entry, NOT exposed to agents
```

### 11.8 Human-gate & notification tools (cross-role)

```ts
proposal.create(input: {
  projectId: ID;
  type: ProposalType;
  payload: Json;
  approverUserIds: ID[];
  reason: string;
  expiresAt?: ISODate;
}): Proposal
// role: LEAD | PM_AGENT | INTEGRATOR (also used internally by auto-gating)
// side-effect: fan-out to IM gateway

proposal.list(input: { projectId: ID; status?: ProposalStatus }): Proposal[]
// role: any

proposal.resolve(input: {
  proposalId: ID;
  decision: "APPROVE" | "REJECT";
  note?: string;
}): Proposal
// role: approver in proposal.approverUserIds (usually invoked by im-gateway callback)
// mode: auto; triggers the queued action

notify.send(input: {
  userIds: ID[];
  templateKey: string;
  params: Json;
  priority?: "low" | "normal" | "high";
  refType: string;
  refId: ID;
}): void
// role: LEAD | PM_AGENT
// mode: auto; rate-limited per project

message.send(input: {
  projectId: ID;
  targetType: "MEMBER" | "ROLE" | "ASSIGNMENT" | "WORK_ITEM" | "THREAD";
  targetRef: ID;
  threadRefType: string;
  threadRefId: ID;
  messageType: "NOTE" | "QUESTION" | "ALERT" | "REPLY" | "STATUS_UPDATE";
  content: string;
  requiresAck?: boolean;
}): ProjectMessage
// role: any member with thread visibility; `requiresAck=true` may fan out an inbox item

inbox.ack(input: {
  inboxItemId: ID;
  note?: string;
}): ProjectInboxItem
// role: target member/runtime only

inbox.defer(input: {
  inboxItemId: ID;
  until?: ISODate;
  note?: string;
}): ProjectInboxItem
// role: target member/runtime only

presence.heartbeat(input: {
  projectId: ID;
  runtimeId: ID;
  state: "IDLE" | "ACTIVE" | "SLEEPING";
}): void
// role: active runtime only
```

### 11.9 Permission matrix (summary)

Legend: A = Allow auto; P = Routed through Proposal; D = Deny.

| Tool | OWNER | LEAD | PLANNER | WORKER | REVIEWER | PM | INTEGRATOR |
|---|---|---|---|---|---|---|---|
| `project.getBrief` / `taskPacket.get` / `inbox.list` / `message.list(linked)` | A | A | A | A | A | A | A |
| `project.get` / `goal.list` / `feature.list` / `event.list(project-wide)` / `metric.getSnapshot` | A | A | A | D* | D* | A | A |
| `goal.create` | A | A / P* | D | D | D | D | D |
| `goal.update` | A | A / P | D | D | D | D | D |
| `goal.close` | A | A / P | D | D | D | D | D |
| `goal.reopen` | A (as approver) | P | D | D | D | D | D |
| `feature.*` | A | A | A | D | D | D | D |
| `workItem.create/update/cancel` | A | A | A | D | D | D | D |
| `assignment.create/pause/release` | A | A | D | D | D | D | D |
| `assignment.claim` | D | D | A | A | A | D | A |
| `run.* / artifact.submit / handoff.submit` | D | A | A | A | A | A | A |
| `review.request / review.resolve` | A | A | D | D | A | D | D |
| `memory.write` | A | A | A | A | A | A | A |
| `metric.computeSnapshot` | A | A | D | D | D | A | D |
| `proposal.create` | A | A | D | D | D | A | A |
| `proposal.resolve` | A (if approver) | A (if approver) | D | D | D | D | D |
| `external.mergePR` | A | A / P | D | D | D | D | A / P |
| `notify.send` | A | A | D | D | D | A | D |
| `message.send` / `inbox.ack` / `inbox.defer` / `presence.heartbeat` | A | A | A | A (own scope) | A (own scope) | A | A |

`A / P` means "auto under default autonomy, proposal under stricter project settings or when rule-gated."
`D*` means "deny by default; may be allowed only if explicitly granted `PROJECT_WIDE` scope."

## 12. End-to-End Timelines

### 12.1 S1 — Complex goal dispatch

| # | Actor | MCP call | Reads | Writes | Events fired | Human gate |
|---|---|---|---|---|---|---|
| 1 | Owner | `goal.create` | — | `ProjectGoal` | `GOAL_CREATED` | No (human author) |
| 2 | Lead | `feature.create` ×3 | Goal, Brief | `ProjectFeature` ×3 | `FEATURE_CREATED` ×3 | No |
| 3 | Planner | `workItem.create` ×6 | Features, Memory | `ProjectWorkItem` ×6 | `WORK_ITEM_CREATED` ×6 | No |
| 4 | Lead | `assignment.create` ×6 | Members + capabilities | `ProjectAssignment` ×6 | `ASSIGNMENT_CREATED` ×6 | No |
| 5 | Worker A | `assignment.claim` → `run.start` → `artifact.submit` (PR link) | TaskPacket | Run, Artifact, ExternalLink | `RUN_FINISHED`, `EXTERNAL_LINK_CREATED` | No |
| 6 | Worker A | `handoff.submit` | — | Artifact(HANDOFF), Review(PENDING) | `HANDOFF_SUBMITTED`, `REVIEW_REQUESTED` | No |
| 7 | Reviewer | `review.resolve` APPROVED | Artifact, criteria | Review, Memory(DECISION) | `REVIEW_RESOLVED`, `MEMORY_WRITTEN` | No |
| 8 | Integrator | `external.mergePR` | ExternalLink | ExternalEvent | `INTEGRATE_DONE` | P if protected branch |
| 9 | System | ingest GitHub `pr_merged` | — | ExternalEvent, ProjectEvent | `EXTERNAL_EVENT_INGESTED` | No |
| 10 | PM | `metric.computeSnapshot` (cron) | All events | MetricSnapshot | `METRIC_SNAPSHOT_WRITTEN` | No |

### 12.2 S4 — Goal change under approval

| # | Actor | MCP call | Reads | Writes | Events | IM send → who |
|---|---|---|---|---|---|---|
| 1 | Lead | `goal.update` with semantic patch | Goal | Proposal(GOAL_CHANGE, PENDING) | `PROPOSAL_CREATED` | Owner |
| 2 | gateway | `POST /notify` | Channels | NotificationDelivery(SENT) | — | Owner via preferred channel |
| 3 | Owner | reply `/approve <id>` | — | — | — | — |
| 4 | gateway | `POST /inbound/<platform>` → `proposal.resolve` | Delivery by `messageExternalId` | Proposal(APPROVED), Delivery(REPLIED) | `PROPOSAL_RESOLVED` | — |
| 5 | System | apply queued patch | — | Goal updated | `GOAL_UPDATED` | Members with affected assignments |
| 6 | Affected Workers | `runtime.resumeProject` / `inbox.list` | Inbox, assignments, refreshed packets | ACK / resume decision | `TASK_PACKET_REBASED` if needed | — |

### 12.3 S5 — Cloud-worker dispatch and re-entry

| # | Actor | MCP call | Reads | Writes | Events fired | Human gate |
|---|---|---|---|---|---|---|
| 1 | Lead | `runtime.provisionCloudWorker` | capability need + provisioning policy outcome | Member, AgentRuntime, AccessGrant | `CLOUD_RUNTIME_PROVISIONED` | Out of scope here |
| 2 | Lead | `assignment.create` | WorkItem + capabilities | Assignment, TaskPacket, InboxItem(`ASSIGNMENT_DISPATCH`) | `ASSIGNMENT_CREATED`, `INBOX_ITEM_CREATED` | No |
| 3 | System | runtime wake | AgentRuntime, Presence | Presence update, Delivery log | `RUNTIME_WAKE_REQUESTED` | No |
| 4 | Cloud worker | `runtime.resumeProject` | token / grant | Presence heartbeat, inbox cursor | `PARTICIPANT_RESUMED` | No |
| 5 | Cloud worker | `run.start` | assignment + fresh packet | Run | `RUN_STARTED` | No |
| 6 | System | CI or peer alert later | ExternalEvent / Message | InboxItem + packet rebase if needed | `CI_FAILED` / `TASK_PACKET_REBASED` | No |
| 7 | Cloud worker | `runtime.resumeProject` | inbox first | ACK / continue work | `PARTICIPANT_RESUMED` | No |

## 13. Compatibility With v1

- **Schema**: all v2 additions are new tables (`project_member_capabilities`, `project_proposals`, `project_events`, `external_links`, `external_events`, `project_metric_snapshots`, `notification_channels`, `notification_deliveries`, `agent_runtimes`, `project_access_grants`, `project_inbox_items`, `project_messages`, `project_threads`, `participant_presence`) plus a few optional columns on existing tables (`ProjectWorkItem.concurrencyMode` defaulting to `SINGLE`). No column is removed.
- **Behavior**: default `Project.settings.autonomy.*` preserves v1's manual flow until explicitly flipped on. A v1 project continues to work.
- **Services**: `agentcraft-im-gateway` is a new standalone service; v1 deployments stay intact if it is not deployed.

## 14. Rollout Milestones

- **M1 — Role contracts + capabilities + runtime identity**
  - Capability table + seeding
  - `AgentRuntime` + `ProjectAccessGrant` + token minting
  - Project.settings autonomy flags
- **M2 — Event bus + inbox/message + proposals**
  - `ProjectEvent` table + `event.list` + seq cursor
  - `ProjectInboxItem` + `ProjectMessage` + `ProjectThread`
  - `runtime.resumeProject` + participant cursor
  - `ProjectProposal` table + approval flow
- **M3 — IM gateway (MVP)**
  - `agentcraft-im-gateway` service skeleton with `email` + one IM platform
  - `NotificationChannel` pairing flow
- **M4 — Full MCP tool surface + permission matrix**
  - Wire every tool in §11
  - Enforce visibility scopes + runtime-aware auth
- **M5 — Concurrency + External integration + PM**
  - `concurrencyMode` enforcement
  - salvage handoff + shared coordination threads
  - `ExternalLink` / `ExternalEvent` + GitHub webhook receiver
  - `ProjectMetricSnapshot` cron + PM_AGENT skill

## 15. Open Questions

- Should `concurrencyMode` default vary by `workType` beyond REVIEW? Candidate: RESEARCH → RACE.
- Inbound webhook auth: per-platform signature is standard, but pairing replay needs a short-lived nonce on the one-time code — exact TTL?
- Memory write deduplication: simple `(projectId, type, title)` uniqueness, or semantic near-duplicate detection at write time?
- `event.list` cursor semantics: `seq` is monotonic int per project; confirm that is enough vs `(seq, createdAt)` tuple for disaster recovery.
- Proposal timeout policy (default chosen, still open for tuning): Owner no-response 24h → escalate to Lead; 48h → default REJECT. Should BUDGET_INCREASE have a longer window?
- Should losing Runs under `RACE` mode be charged to the project budget, or only the winner?

## 16. v1 → v2 Cross-Reference

| Concern | v1 | v2 addition |
|---|---|---|
| Project / Goal / Feature / WorkItem | ✓ | Goal lifecycle ops + cascade |
| Assignment / Run / Artifact / Review / Memory | ✓ | No change; L3/L4 semantics formalized |
| Member role | `role` string only | + `ProjectMemberCapability` |
| Human approval | Ad-hoc (implicit) | `ProjectProposal` unified gate |
| Event bus | None | `ProjectEvent` (seq cursor) |
| Runtime identity | None | `AgentRuntime` + `ProjectAccessGrant` + signed access token |
| External systems | None | `ExternalLink` + `ExternalEvent` |
| Metrics | None | `ProjectMetricSnapshot` |
| Agent coordination | None | `ProjectInboxItem` + `ProjectMessage` + `ProjectThread` + `ParticipantPresence` |
| Human notifications | None | `NotificationChannel` + `NotificationDelivery` + `agentcraft-im-gateway` |
| Concurrency | Implicit single | `concurrencyMode` on WorkItem |
| MCP | v1 §15 phased | §11 full signatures + runtime-aware permission matrix |
