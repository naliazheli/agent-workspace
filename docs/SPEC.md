# agent-workspace Specification

> Status: Draft v0.1 — derived from AgentCraft `project-platform-v2-collab-design.md`.
> This is the normative spec. For the big-picture mental model read `architecture.md` first.

This specification defines the remote-project-level collaboration layer for multi-agent systems. It covers the domain model, context layering, role contracts, state machines, event semantics, human-approval flow, concurrency rules, and the MCP tool surface.

The reference implementation lives in [AgentCraft](https://github.com/naliazheli/agentcraft) (`aifactory-server/src/projects/` + `agentcraft-im-gateway`) and will be extracted into this repo in phases. Any product/service names referenced below (`agentcraft-im-gateway`, `aifactory-server`) are the reference implementation; the spec itself is product-neutral — re-implement freely.

---

## 1. Motivation & Gap

Multi-agent stacks today handle tool-calling, single-agent orchestration, and agent-to-agent messaging well. They do not handle **complex work that requires shared project context, role assignment, task decomposition, progress tracking, and coordinated execution across many agents and humans over time**. Three layers are missing:

1. **Handshake protocol** — context stratified so agents can subscribe to what they need, not the whole history.
2. **Event closure** — a single internal event bus plus external-system feedback and human notification.
3. **Concurrency coordination** — explicit modes for racing, pairing, and primary/backup work items.

A concrete pain: without a built-in messaging channel, agent-originated approval requests have no home. This spec mandates an IM gateway as a first-class citizen.

## 2. Reference Blueprints

We borrow shapes rather than port methodologies:

- **Open-source maintainer model** — maintainer / triager / contributor / reviewer / CI bot. Informs §4.
- **Linear / Shape Up** — flat issues, explicit cycles, strong ownership. Informs §9.
- **Hermes `gateway/`** (https://github.com/openclaw/hermes-agent) — per-platform adapter + channel directory + delivery retry + pairing flow. Blueprint for §10.

We explicitly do **not** port Scrum ceremonies. Agents run on events, not standups.

## 3. Core Collaboration Scenarios

Every abstraction must drive these four scenarios end-to-end:

- **S1 — Complex goal dispatch**
  Owner writes a complex Goal → Lead decomposes into Features → Planner breaks out WorkItems with recommended skills → Lead assigns multiple Workers → each Worker submits a PR → Reviewer accepts → progress written back.

- **S2 — CI-failure self-heal**
  Worker submits PR → external webhook reports CI failure → `ExternalEvent` becomes `ProjectEvent(CI_FAILED)` → WorkItem flips to `NEEDS_REVISION` → same Assignment reactivated with fresh packet embedding the failure log.

- **S3 — PM weekly report**
  PM agent reads `ProjectMetricSnapshot` on a schedule → produces a `PM_REPORT` artifact → flags stalled items → creates `REASSIGN` proposal → pushed via IM gateway.

- **S4 — Goal change under human approval**
  Lead detects mis-scoped Goal → creates `GoalChangeProposal` → IM gateway pushes approval card to Owner → Owner approves → gateway calls `proposal.resolve` → Goal updated, downstream adjusted.

## 4. Roles & Contracts

Role is not a locked enum. It is `role + capability tags + capability bundles`. Agents are matched to work by capability, but their actual authority is still the intersection of role policy, project policy, and the active `ProjectAccessGrant`.

| Role | Reads | Writes | MCP tool subset | Lifecycle |
|---|---|---|---|---|
| **OWNER** (human) | All | Goal definitions, Proposal approvals | Read all; `goal.*`, `proposal.resolve` | Project create → archive |
| **LEAD_AGENT** | Brief, Shared Memory, all Events | Goal/Feature/WorkItem plans, Assignments, Proposals | Read all; `goal.*`, `feature.*`, `workItem.*`, `assignment.*`, `proposal.create`, `notify.send` | Attached at create; released at archive |
| **PLANNER_AGENT** (optional) | Brief, Shared Memory, target Goal | WorkItems + recommended skills | `goal.get`, `feature.create`, `workItem.create`, `memory.write` | Invoked by Lead per Goal; ends when Goal is READY |
| **WORKER_AGENT** | Own TaskPacket (L3), referenced Memory | Runs, Artifacts, Handoff | `taskPacket.get`, `run.*`, `artifact.submit`, `handoff.submit`, `externalLink.create` | `assignment.claim` → `handoff.submit` / release |
| **REVIEWER_AGENT** | WorkItem + Artifact + criteria + Memory | Review, Memory | `review.*`, `memory.write` | `handoff.submit` triggers; ends on resolve |
| **PM_AGENT** | MetricSnapshot, Events, Proposals | PM_REPORT artifacts, Reassign proposals | `metric.*`, `artifact.submit`, `proposal.create` | Schedule / explicit invoke |
| **INTEGRATOR_AGENT** | ExternalLinks, accepted WorkItems | ExternalEvent | `external.*` | WorkItem ACCEPTED with `outputContract.autoMerge` |

Rules:
- One project has exactly one OWNER and one LEAD_AGENT minimum.
- PLANNER and INTEGRATOR are optional — Lead may absorb them.
- "Firing" a role never deletes history; it ends the Assignment.
- A role may declare `capabilityBundleRefs` and `runtimeCompatibility`. These are desired capability surfaces, not automatic permission. Hermes, Codex, and Claude Code can expose native plugin or hook surfaces when their selected image/adapter includes the right bundle loader; simpler adapters may receive only portable skill/prompt/context surfaces.
- `skillBundleRefs` remain the lowest-common-denominator delivery mechanism for current runtimes. `capabilityBundleRefs` are the project/audit abstraction and should eventually subsume raw skill lists.

## 5. Four-Layer Context Abstraction

**Agents do not share one giant project conversation.** Context is stratified into four layers with explicit read/write rules.

| Layer | Writer | Reader | Write trigger | Agent reference |
|---|---|---|---|---|
| **L1 Project Brief** | OWNER, LEAD (with proposal) | All members | Project create; Brief-update proposal | `project.get → brief` |
| **L2 Shared Memory** | Any role with write cap; auto-extracted on APPROVED Review | All members (filter by type) | Review APPROVED; explicit decision; accepted Handoff | `memory.search(filter)` |
| **L3 Task Packet** | LEAD / PLANNER at Assignment create | Assignee only | Assignment creation (snapshot) | `taskPacket.get(assignmentId)` |
| **L4 Handoff Package** | WORKER at end of Assignment | Reviewer, Lead, subsequent Workers | `handoff.submit` | Artifact of `artifactType=HANDOFF` |

L3 is generated **by the coordinator, not the worker**. This is the rule that keeps context minimal.

### Minimum L3 (Task Packet)
- objective (derived from WorkItem)
- acceptance criteria
- references to relevant Memory entries (by id, not copied content)
- upstream dependency summaries
- suggested skills / tool hints
- output contract

### Minimum L4 (Handoff Package)
- summary of what was done
- what changed (files, endpoints, schemas, external links)
- what remains
- blockers
- risks
- recommended next step
- evidence links

## 6. Domain Model

Entities. Fields are indicative; see `schemas/` for the canonical definitions once extracted.

### 6.1 Core entities (the execution skeleton)

- `Project` — top-level container (`id`, `name`, `slug`, `summary`, `brief`, `status`, `ownerId`, `leadAgentUserId`, `budget*`, `settings`, timestamps).
- `ProjectMember` — membership (`projectId`, `userId`, `role`, `permissions`, `joinedAt`, `removedAt`).
- `ProjectGoal` — top-level outcome under a project.
- `ProjectFeature` — deliverable capability under a Goal.
- `ProjectWorkItem` — execution unit assigned to one or more agents; has `workType`, `acceptanceCriteria`, `outputContract`, `dependsOn[]`, `concurrencyMode`.
- `ProjectAssignment` — agent ↔ work item, with `role`, `status`, `contextPacket`.
- `ProjectRun` — one execution attempt under an Assignment.
- `ProjectArtifact` — structured deliverable.
- `ProjectReview` — acceptance gate.
- `ProjectMemory` — structured fact (`memoryType` ∈ `DECISION | CONSTRAINT | FACT | RISK | OPEN_QUESTION | INTERFACE_CONTRACT`).

### 6.2 Coordination entities (added by this spec)

- `CapabilityBundle` - manifested project capability package (`ref`, `version`, `surfaces.skills/tools/mcpServers/hooks`, `requiredScopes`, `requiredProjectGlobals`, `runtimeCompatibility`, `shareContext`). A bundle is declarative; it does not bypass authorization.
- `ProjectCapabilityBundleInstallation` - project-installed bundle snapshot (`projectId`, `bundleRef`, `manifestSnapshot`, `discoverability`, `shareTargets`, `status`, `installedByMemberId`).

- `ProjectMemberCapability` — capability tags on a member (`capability`, `level`, `source`).
- `ProjectProposal` — unified human-approval carrier (`type`, `payload`, `approverUserIds`, `status`, `expiresAt`, …). Types: `GOAL_DEFINITION | GOAL_CHANGE | GOAL_CLOSE | GOAL_REOPEN | BUDGET_INCREASE | REASSIGN | SCOPE_CHANGE | MEMBER_INVITE`.
- `ProjectEvent` — internal event bus (`seq`, `type`, `refType`, `refId`, `payload`, `actorUserId`).
- `ExternalLink` — bind an internal entity to an external object (`externalType`, `externalId`, `externalUrl`, `metadata`).
- `ExternalEvent` — incoming normalized event from external systems.
- `ProjectMetricSnapshot` — periodic rollup (WIP, cycle time, review pass rate, bug rate, budget, per-member stats).
- `NotificationChannel` — user ↔ IM account (`platform`, `externalAccountId`, `priority`, `verifiedAt`).
- `NotificationDelivery` — single send audit + idempotency.

## 7. Goal Lifecycle

### 7.1 Operations

- **`createGoal(projectId, title, description, priority)`**
  - LEAD or OWNER may call.
  - If this is the **first goal** of the project and the caller is an agent, it routes through `ProjectProposal(type=GOAL_DEFINITION)` for OWNER approval. Subsequent goals by LEAD auto-execute (configurable in `Project.settings.autonomy.goalCreate`).
  - Emits `GOAL_CREATED`.

- **`updateGoal(goalId, patch)`**
  - Safe fields (`priority`, `sortOrder`, cosmetic `title`) apply directly.
  - Semantic changes route through `ProjectProposal(type=GOAL_CHANGE)`.
  - Emits `GOAL_UPDATED`.

- **`closeGoal(goalId, reason, cascade=true)`**
  - If `cascade=true` and `IN_PROGRESS` descendants exceed a threshold (default > 3 WorkItems, configurable), routes through `ProjectProposal(type=GOAL_CLOSE)`. Otherwise auto.
  - Cascade in a single transaction:
    1. Child `ProjectFeature` not in `DONE` → `CANCELLED`.
    2. Child `ProjectWorkItem` not in `ACCEPTED` → `CANCELLED`.
    3. `ProjectAssignment` in `ACTIVE | PAUSED | PROPOSED` → `RELEASED` with `resolvedNote = reason`.
    4. `ProjectRun` in `QUEUED | RUNNING` → `CANCELLED`; log cost up to cancel.
    5. Write `ProjectMemory(type=DECISION, title="Goal closed: <title>")`.
    6. Emit `GOAL_CLOSED` with `payload.affected = { features, workItems, assignments, runs }`.
    7. IM gateway broadcasts to LEAD and all members with active assignments.
  - **Already-merged external code is not rolled back.** Rollback, if needed, is a new Goal.

- **`reopenGoal(goalId, reason)`**
  - Always a proposal. OWNER-only approval. LEAD cannot auto-reopen even under full autonomy.

### 7.2 Status transitions

```
OPEN ─► IN_PROGRESS ─► DONE
  │         │
  │         ├─► BLOCKED ─► IN_PROGRESS
  └─────────┴─► CANCELLED   (via closeGoal)
                  │
                  └─► OPEN (via reopenGoal, proposal only)
```

## 8. Concurrent Assignments

`ProjectWorkItem.concurrencyMode`:

| Mode | Meaning | Winning rule |
|---|---|---|
| `SINGLE` | Default. One ACTIVE assignment. | `assignment.claim` rejects if an ACTIVE exists. |
| `RACE` | Workers compete. | First accepted Handoff wins; others auto-`RELEASED` with `resolvedNote="lost_race"`. Losers' Runs kept. |
| `MULTI_ROLE` | Different roles in parallel. | One ACTIVE per `role`. |
| `PRIMARY_BACKUP` | Primary works; backup warms up. | Only primary's Handoff triggers review. Backup promotes on primary FAILED/timeout. |

Defaults:
- `workType=REVIEW` → `MULTI_ROLE`.
- `workType=RESEARCH` → LEAD may pick `RACE`.
- All others → `SINGLE`.

Guarantees:
- **Isolated packets.** Every Assignment snapshots its own L3. No shared scratchpad.
- **Single Handoff target.** When a Handoff is accepted, WorkItem becomes `ACCEPTED` and open Assignments close by the winning rule.
- **Cost visibility.** All Runs kept; PM snapshot includes losers' cost.

Claim semantics:

```
SINGLE          → fail if any ACTIVE exists
RACE            → succeed up to Project.settings.race.maxParticipants
MULTI_ROLE      → fail if ACTIVE with same role exists
PRIMARY_BACKUP  → first claim = primary; second = backup; third rejected
```

## 9. State Machine & Human-Approval Gates

### 9.1 WorkItem edges

- `IN_REVIEW → NEEDS_REVISION` **reuses** the same Assignment (reactivate), with a fresh L3 packet embedding the review note.
- `ACCEPTED` inspects `outputContract.autoMerge` / `outputContract.postActions`; if set, emits `INTEGRATE_REQUESTED` event for INTEGRATOR.

### 9.2 Full list of human-approval gates

Every item below routes through `ProjectProposal` and triggers IM notification:

1. First Goal definition of a project, if authored by an agent.
2. `closeGoal` whose cascade would cancel more than N in-progress WorkItems (default N=3).
3. `reopenGoal` — always.
4. Cumulative project spend exceeding `Project.budgetAmount * threshold` (default 80%).
5. Review REJECTED twice in a row on the same WorkItem.
6. Merge to a protected branch (`ExternalLink.metadata.protected=true`).
7. Scope-change proposals (a WorkItem/Feature outside its closest Goal).
8. Member invite in a `private` project.

## 10. IM Gateway (Notification Path)

### 10.1 Why separate

IO-heavy, platform-specific, easy to block. Isolate from the main server. Reuse the Hermes-gateway shape: per-platform adapters + channel directory + delivery with retry and idempotency + pairing for user↔account binding.

### 10.2 Architecture

```
                 ┌──────────────────────┐
                 │   project server     │
                 └─────────┬────────────┘
                           │ POST /notify
                           ▼
                 ┌──────────────────────┐
                 │     im-gateway       │
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
```

### 10.3 Business-side triggers

- Every `ProjectProposal` creation → fan-out to `approverUserIds`.
- High-priority `ProjectEvent` types (`CI_FAILED` streak, budget warning, `REVIEW_REJECTED` ×2) → Owner + Lead.
- PM `PM_REPORT` artifacts → project watchers.

### 10.4 Gateway API

- `POST /notify` — `{ userId, templateKey, params, refType, refId, priority }`. Resolves NotificationChannel rows for `userId`, picks by `priority` + `enabled`, enqueues a `NotificationDelivery` per fallback target, retries with backoff.
- `POST /notify/broadcast` — `{ projectId, roleFilter?, templateKey, params, refType, refId, priority }`.
- `GET /channels/:userId`.
- `POST /channels/pair` — `{ userId, platform }` → `{ pairingCode, expiresAt, instructionsUrl }`.
- `POST /inbound/:platform` — signed platform webhook.

### 10.5 Approval reply flow

1. Proposal notification renders a message with buttons / commands (`/approve <proposalId>` / `/reject <proposalId> <reason>`).
2. Platform posts reply to `/inbound/:platform`. Gateway verifies signature, locates `NotificationDelivery` via `messageExternalId`, resolves user via `NotificationChannel.externalAccountId`.
3. Gateway calls `proposal.resolve` on project server with `{ decision, note, actingUserId }`.
4. Project server updates `ProjectProposal.status`, fires `PROPOSAL_RESOLVED`, performs the queued action, records `NotificationDelivery.status=REPLIED`.

### 10.6 Idempotency & security

- `NotificationDelivery.messageExternalId` unique per platform → inbound dedup.
- Every inbound webhook must carry a platform signature; unverified requests dropped.
- Pairing uses a one-time code with short TTL; user proves account control by echoing the code in the target platform.
- Project server ↔ gateway calls use an internal token; gateway never leaks user PII.

### 10.7 Platform rollout (reference)

- **Tier 1**: `email` (required) + `dingtalk` or `slack`.
- **Tier 2**: `matrix`, `telegram`, `mattermost`.
- **Out of scope for v1**: sms, whatsapp, voice.

## 11. MCP Tool Surface

All tools use pseudo-TypeScript. `auto | proposal` marks whether the write flows through directly under default autonomy. Every tool implicitly requires project membership; additional role constraints listed.

```ts
type ID = string;
type ISODate = string;
type Json = Record<string, unknown>;
interface Pagination { limit?: number; cursor?: string }
interface Page<T> { items: T[]; nextCursor?: string }
```

### 11.1 Read tools (all roles; filtered by membership)

```ts
project.get(input: { projectId: ID }): Project
project.listMembers(input: { projectId: ID }): Member[]
goal.list(input: { projectId: ID; status?: GoalStatus }): Goal[]
goal.get(input: { goalId: ID }): Goal
feature.list(input: { projectId?: ID; goalId?: ID; status?: FeatureStatus }): Feature[]
workItem.list(input: {
  projectId: ID; status?: WorkItemStatus; assigneeId?: ID;
  goalId?: ID; featureId?: ID;
} & Pagination): Page<WorkItem>
workItem.get(input: { workItemId: ID }): WorkItem & { dependencies: WorkItem[]; recentEvents: ProjectEvent[] }
memory.search(input: { projectId: ID; type?: MemoryType; query?: string; limit?: number }): Memory[]
taskPacket.get(input: { assignmentId: ID }): TaskPacket
// role: assignee | LEAD | REVIEWER
event.list(input: { projectId: ID; sinceSeq?: number; types?: EventType[]; limit?: number }): { events: ProjectEvent[]; lastSeq: number }
metric.getSnapshot(input: { projectId: ID; periodKey?: string }): MetricSnapshot
externalLink.list(input: { workItemId: ID }): ExternalLink[]
```

### 11.2 Planning (LEAD / PLANNER)

```ts
goal.create(input: { projectId: ID; title: string; description?: string; priority?: number }): Goal
// mode: proposal if first goal authored by agent; else auto

goal.update(input: { goalId: ID; patch: Partial<GoalPatch> }): Goal
// mode: auto for safe fields; else proposal

goal.close(input: { goalId: ID; reason: string; cascade?: boolean }): {
  goal: Goal;
  affected: { features: ID[]; workItems: ID[]; assignments: ID[]; runs: ID[] };
}
// mode: proposal if inProgressDescendants > threshold; else auto

goal.reopen(input: { goalId: ID; reason: string }): Goal
// mode: proposal (OWNER approver)

feature.create / feature.update / feature.close
workItem.create(input: {
  projectId: ID; goalId?: ID; featureId?: ID; parentWorkItemId?: ID;
  title: string; workType: string; description?: string; scopeBrief?: string;
  acceptanceCriteria?: string; outputContract?: Json; dependsOn?: ID[];
  concurrencyMode?: "SINGLE" | "RACE" | "MULTI_ROLE" | "PRIMARY_BACKUP";
  priority?: number; dueAt?: ISODate;
}): WorkItem
workItem.update / workItem.cancel / workItem.markReady
```

### 11.3 Dispatch (LEAD)

```ts
assignment.create(input: {
  workItemId: ID; assigneeUserId: ID;
  role: "WORKER" | "REVIEWER" | "PLANNER" | "INTEGRATOR";
  objective: string; contextPacket: TaskPacket;
  concurrencyModeOverride?: WorkItemConcurrencyMode;
}): Assignment
assignment.pause / assignment.release / assignment.restart
member.invite(input: { projectId: ID; userId: ID; role: string; capabilities?: string[] }): Member
// mode: auto if project.visibility="public"; proposal if "private"
member.remove
```

### 11.4 Execution (WORKER)

```ts
assignment.claim(input: { workItemId: ID; role?: string }): Assignment
// respects concurrencyMode per §8

run.start(input: { assignmentId: ID; instruction: string; contextSnapshot?: Json; runType?: string }): Run
run.log(input: { runId: ID; level?: "debug"|"info"|"warn"|"error"; message: string; metadata?: Json }): void
run.finish(input: { runId: ID; status: "SUCCEEDED"|"FAILED"|"CANCELLED"; resultSummary?: string; costInfo?: Json }): Run

artifact.submit(input: {
  workItemId: ID; assignmentId?: ID; runId?: ID;
  artifactType: string; title?: string; content?: string; url?: string; metadata?: Json;
}): Artifact

handoff.submit(input: {
  assignmentId: ID;
  summary: string; changes: string;
  remaining?: string; blockers?: string; risks?: string; nextStep?: string;
  evidence: Array<{ kind: string; url?: string; refArtifactId?: ID }>;
}): Artifact  // artifactType = "HANDOFF"
// side-effect: moves WorkItem to IN_REVIEW and calls review.request

externalLink.create(input: {
  workItemId: ID;
  externalType: "GITHUB_ISSUE" | "GITHUB_PR" | "GITHUB_COMMIT" | "GITHUB_CI_RUN";
  externalId: string; externalUrl: string; metadata?: Json;
}): ExternalLink
```

### 11.5 Review (REVIEWER)

```ts
review.request(input: { workItemId: ID; assignmentId?: ID; artifactId?: ID; reviewerType: "agent"|"human"|"rule"; checklist?: Json }): Review
review.resolve(input: { reviewId: ID; status: "APPROVED"|"CHANGES_REQUESTED"|"REJECTED"; note?: string; checklistResult?: Json }): Review
// APPROVED triggers Memory extraction; REJECTED ×2 on same WorkItem triggers proposal
memory.write(input: { projectId: ID; memoryType: MemoryType; title?: string; content: string; summary?: string; sourceArtifactId?: ID }): Memory
```

### 11.6 PM (PM_AGENT)

```ts
metric.computeSnapshot(input: { projectId: ID; periodKey?: string }): MetricSnapshot
// plus artifact.submit with artifactType="PM_REPORT"
proposal.create(input: { projectId: ID; type: "REASSIGN"|"SCOPE_CHANGE"|"BUDGET_INCREASE"; payload: Json; approverUserIds: ID[]; reason: string; expiresAt?: ISODate }): Proposal
```

### 11.7 Integrator (INTEGRATOR_AGENT)

```ts
external.mergePR(input: { externalLinkId: ID; strategy?: "merge"|"squash"|"rebase" }): ExternalEvent
// mode: proposal if target branch is protected; else auto
external.triggerAction(input: { externalLinkId: ID; action: string; params?: Json }): ExternalEvent
// externalEvent.ingest — internal webhook entry, NOT exposed to agents
```

### 11.8 Human gate & notification (cross-role)

```ts
proposal.create(input: { projectId: ID; type: ProposalType; payload: Json; approverUserIds: ID[]; reason: string; expiresAt?: ISODate }): Proposal
proposal.list(input: { projectId: ID; status?: ProposalStatus }): Proposal[]
proposal.resolve(input: { proposalId: ID; decision: "APPROVE"|"REJECT"; note?: string }): Proposal
// role: approver in proposal.approverUserIds (usually invoked by im-gateway callback)

notify.send(input: { userIds: ID[]; templateKey: string; params: Json; priority?: "low"|"normal"|"high"; refType: string; refId: ID }): void
// rate-limited per project
```

### 11.9 Permission matrix

`A` = Allow auto, `P` = Proposal, `D` = Deny.

| Tool | OWNER | LEAD | PLANNER | WORKER | REVIEWER | PM | INTEGRATOR |
|---|---|---|---|---|---|---|---|
| All read tools | A | A | A | A (own scope) | A | A | A |
| `goal.create` | A | A/P* | D | D | D | D | D |
| `goal.update` | A | A/P | D | D | D | D | D |
| `goal.close` | A | A/P | D | D | D | D | D |
| `goal.reopen` | A (approver) | P | D | D | D | D | D |
| `feature.*` | A | A | A | D | D | D | D |
| `workItem.create/update/cancel` | A | A | A | D | D | D | D |
| `assignment.create/pause/release` | A | A | D | D | D | D | D |
| `assignment.claim` | D | D | A | A | A | D | A |
| `run.* / artifact.submit / handoff.submit` | D | A | A | A | A | A | A |
| `review.request / review.resolve` | A | A | D | D | A | D | D |
| `memory.write` | A | A | A | A | A | A | A |
| `metric.computeSnapshot` | A | A | D | D | D | A | D |
| `proposal.create` | A | A | D | D | D | A | A |
| `proposal.resolve` | A (approver) | A (approver) | D | D | D | D | D |
| `external.mergePR` | A | A/P | D | D | D | D | A/P |
| `notify.send` | A | A | D | D | D | A | D |

`A/P` = auto under default autonomy; proposal under stricter settings or when rule-gated.

## 12. End-to-End Timelines

### 12.1 S1 — Complex goal dispatch

| # | Actor | MCP | Writes | Events | Human gate |
|---|---|---|---|---|---|
| 1 | Owner | `goal.create` | Goal | `GOAL_CREATED` | No |
| 2 | Lead | `feature.create` ×3 | Feature ×3 | `FEATURE_CREATED` ×3 | No |
| 3 | Planner | `workItem.create` ×6 | WorkItem ×6 | `WORK_ITEM_CREATED` ×6 | No |
| 4 | Lead | `assignment.create` ×6 | Assignment ×6 | `ASSIGNMENT_CREATED` ×6 | No |
| 5 | Worker A | claim → run.start → artifact.submit | Run, Artifact, ExternalLink | `RUN_FINISHED`, `EXTERNAL_LINK_CREATED` | No |
| 6 | Worker A | `handoff.submit` | Artifact(HANDOFF), Review | `HANDOFF_SUBMITTED`, `REVIEW_REQUESTED` | No |
| 7 | Reviewer | `review.resolve` APPROVED | Review, Memory | `REVIEW_RESOLVED`, `MEMORY_WRITTEN` | No |
| 8 | Integrator | `external.mergePR` | ExternalEvent | `INTEGRATE_DONE` | P if protected |
| 9 | System | GitHub webhook `pr_merged` | ExternalEvent, ProjectEvent | `EXTERNAL_EVENT_INGESTED` | No |
| 10 | PM | `metric.computeSnapshot` | MetricSnapshot | `METRIC_SNAPSHOT_WRITTEN` | No |

### 12.2 S4 — Goal change under approval

| # | Actor | MCP | Writes | Events | IM → who |
|---|---|---|---|---|---|
| 1 | Lead | `goal.update` semantic | Proposal(GOAL_CHANGE, PENDING) | `PROPOSAL_CREATED` | Owner |
| 2 | gateway | `/notify` | NotificationDelivery(SENT) | — | Owner |
| 3 | Owner | `/approve <id>` | — | — | — |
| 4 | gateway | `/inbound/<p>` → `proposal.resolve` | Proposal(APPROVED), Delivery(REPLIED) | `PROPOSAL_RESOLVED` | — |
| 5 | System | apply patch | Goal updated | `GOAL_UPDATED` | Affected members |
| 6 | Affected Workers | `event.list(sinceSeq)` | — | — | — |

## 13. Compatibility & Extensibility

- **Additive-first.** New entities or fields must default such that old agents/runtime continue to work.
- **Versioned tool surface.** MCP tool names are stable within a major version; behavior changes bump minor.
- **Optional roles.** Any role marked optional in §4 may be absorbed by LEAD without affecting the spec's guarantees.
- **Gateway is optional for silent projects.** If a project has zero human gates and no `notify.send` calls, an im-gateway is not required.

## 14. Open Questions

- Should `concurrencyMode` default vary beyond REVIEW (e.g. RESEARCH → RACE)?
- Inbound webhook pairing nonce TTL — exact value?
- Memory deduplication — simple `(projectId, type, title)` uniqueness or semantic dedup at write time?
- `event.list` cursor — `seq` alone vs `(seq, createdAt)` tuple for DR scenarios?
- Proposal timeout — 24h escalate, 48h default reject is the current proposal; BUDGET_INCREASE may need longer.
- RACE losers' cost — charge to project budget or only the winner?
