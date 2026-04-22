# AgentCraft Project Platform V2 — Agent Inbox and Messaging

> Status: Draft
> Depends on: `project-platform-v2-collab-design.md`, `project-platform-v2-agent-behavior-catalog.md`
> Purpose: define the project-local coordination layer for agent and human participants: inbox, messages, wakeups, and re-entry rules.

---

## 1. Why This Exists

The v2 collaboration design already has:

- `ProjectEvent` for system-level facts
- `ProjectProposal` for approval gates
- an IM gateway for human notification

That is necessary, but still not enough for day-to-day collaboration inside a live project.

We also need a project-local coordination layer that answers:

- How does Agent A notify Agent B about an issue?
- How does a reviewer request rework from a worker?
- How does a cloud worker know it has been assigned work?
- Which events should wake a runtime immediately versus wait until next entry?
- When an agent re-enters, how does it catch up without replaying the entire project history?

This document defines that layer.

## 2. Design Goals

The inbox and messaging system should:

1. support both humans and agents
2. separate structured work signals from casual notes
3. make wake-up policy explicit
4. support cloud agents that are not always online
5. keep re-entry cheap and deterministic
6. preserve auditability

The system should **not** become a generic Slack clone inside the project.

## 3. Design Stance

The right model is not "one shared chat room."

The right model is:

- `ProjectEvent` for durable system facts
- `ProjectInboxItem` for actionable work signals
- `ProjectMessage` for lightweight collaboration
- IM gateway for external human delivery

This gives us:

- high signal for agents
- low ambiguity for automation
- enough flexibility for human-agent coordination

## 4. Core Objects

### 4.1 `ProjectInboxItem`

This is the primary actionable queue for a participant.

An inbox item means:

- something relevant happened
- a participant should look at it
- the platform may or may not wake them

Suggested fields:

- `id`
- `projectId`
- `targetMemberId`
- `targetRuntimeId?`
- `sourceMemberId?`
- `kind`
- `ownerActionType`
- `priority`
- `status`
- `wakeHint`
- `refType`
- `refId`
- `threadRefType?`
- `threadRefId?`
- `summary`
- `details?`
- `dueAt?`
- `createdAt`
- `readAt?`
- `ackedAt?`
- `resolvedAt?`
- `expiresAt?`

Suggested enums:

- `kind`
  - `ASSIGNMENT_DISPATCH`
  - `REVIEW_REQUEST`
  - `REWORK_REQUEST`
  - `CI_INCIDENT`
  - `BLOCKER`
  - `PEER_MESSAGE`
  - `PROPOSAL`
  - `MENTION`
  - `DEPENDENCY_UNBLOCKED`
  - `TOKEN_EXPIRING`
  - `ACCESS_REVOKED`
- `ownerActionType`
  - `CLAIM_ASSIGNMENT`
  - `REVIEW_ARTIFACT`
  - `FIX_CI`
  - `RESPOND_TO_PEER`
  - `ACK_MESSAGE`
  - `RESUME_AFTER_REBASE`
  - `RESOLVE_BLOCKER`
  - `APPROVE_PROPOSAL`
  - `REFRESH_TOKEN`
  - `STOP_WORK`
- `priority`
  - `LOW | NORMAL | HIGH | URGENT`
- `status`
  - `UNREAD | READ | ACKED | DONE | EXPIRED | CANCELLED`
- `wakeHint`
  - `NONE | NEXT_ENTRY | SOFT_WAKE | HARD_WAKE`

### 4.2 `ProjectMessage`

This is a lightweight communication object, not a substitute for review, handoff, or proposal.

Suggested fields:

- `id`
- `projectId`
- `senderMemberId`
- `senderRuntimeId?`
- `targetType`
- `targetRef`
- `threadRefType`
- `threadRefId`
- `messageType`
- `content`
- `metadata?`
- `requiresAck`
- `createdAt`

Suggested enums:

- `targetType`
  - `MEMBER | ROLE | ASSIGNMENT | WORK_ITEM | THREAD`
- `messageType`
  - `NOTE | QUESTION | ALERT | REPLY | STATUS_UPDATE`

### 4.3 `ProjectThread`

Optional but recommended as a stable container for related discussion.

Suggested fields:

- `id`
- `projectId`
- `threadType`
- `refType`
- `refId`
- `title`
- `status`
- `createdAt`
- `closedAt?`

Suggested `threadType`:

- `GOAL`
- `FEATURE`
- `WORK_ITEM`
- `REVIEW`
- `CI_INCIDENT`
- `PROPOSAL`
- `BLOCKER`

This means discussion is explicitly supported at:

- goal level
- feature level
- work-item / subtask level
- review level
- CI-incident level

Subtasks are just work items, so they inherit the same thread and message machinery.

### 4.4 `ParticipantPresence`

Agents, especially cloud workers, are not always online. Presence helps decide whether to wake now or queue for later.

Suggested fields:

- `memberId`
- `runtimeId?`
- `presence`
- `lastSeenAt`
- `lastHeartbeatAt?`
- `wakeEndpoint?`
- `supportsHardWake`

Suggested `presence`:

- `OFFLINE`
- `IDLE`
- `ACTIVE`
- `SLEEPING`
- `UNREACHABLE`

## 5. Separation of Responsibilities

This distinction is critical:

### 5.1 Use `ProjectEvent` when

- the system changed durable state
- auditability matters
- downstream automation should subscribe

Examples:

- assignment created
- handoff submitted
- review resolved
- proposal approved
- CI failed

### 5.2 Use `ProjectInboxItem` when

- a participant needs to pay attention
- the platform may need to wake someone
- there is a concrete action or follow-up

Examples:

- worker assigned a task
- reviewer needs to review
- worker needs to fix CI
- lead needs to resolve blocker

### 5.3 Use `ProjectMessage` when

- the communication is lightweight
- the sender needs to add nuance or ask a question
- formal state transition is not yet required

Examples:

- "I think this PR touched the wrong endpoint"
- "Can you confirm whether this migration is safe?"
- "I am blocked because fixture data is stale"
- "@reviewer can you confirm whether the new API contract is acceptable?"
- "@lead this subtask depends on a schema change"

### 5.4 Use review / proposal / handoff when

- the action is formal and domain-specific
- the platform already has a stronger object for it

Examples:

- do not use plain messages for review decisions
- do not use plain messages for owner approvals
- do not use plain messages for final delivery handoff

## 6. Inbox Generation Rules

Inbox items should be created by deterministic rules, not ad hoc.

### 6.1 Required inbox-creation cases

Create inbox items when:

1. `assignment.create`
   - target assignee gets `ASSIGNMENT_DISPATCH`
2. `handoff.submit`
   - reviewer gets `REVIEW_REQUEST`
3. `review.resolve(CHANGES_REQUESTED)`
   - original worker gets `REWORK_REQUEST`
4. `ExternalEvent(kind=ci_failed)`
   - active assignee gets `CI_INCIDENT`
   - lead gets `CI_INCIDENT` if repeated or severe
5. blocker created
   - lead gets `BLOCKER`
6. proposal created
   - approvers get `PROPOSAL`
7. targeted project message with `requiresAck=true`
   - target gets `PEER_MESSAGE`
   - any explicit `@mention` may also generate `MENTION` if the target is not already covered by a stronger inbox item
8. dependency finished
   - waiting dependent assignee gets `DEPENDENCY_UNBLOCKED`
9. token nearing expiration for cloud worker
   - worker gets `TOKEN_EXPIRING`
10. token revoked
   - worker and lead get `ACCESS_REVOKED`

### 6.2 Do not create inbox items for everything

Avoid inbox spam for:

- every run log line
- every artifact update
- every metric snapshot
- generic FYI events with no likely follow-up

These should stay in the event stream or board activity feed.

### 6.3 Inbox closure rules

Inbox items should not stay open forever. Closing rules must be deterministic.

#### `READ`

Move an item to `READ` when:

- the target opens it in UI
- the runtime receives it during `resumeProject`
- the target thread is fetched as part of an explicit follow-up action

`READ` means "seen", not "handled".

#### `ACKED`

Move an item to `ACKED` when:

- the target explicitly acknowledges it
- the runtime starts the action clearly associated with it

Examples:

- worker begins work on `ASSIGNMENT_DISPATCH`
- reviewer opens a pending review and starts review flow
- worker resumes after `REWORK_REQUEST`

`ACKED` means "I am taking responsibility for this."

#### `DONE`

Move an item to `DONE` when the underlying action is completed.

Examples:

- `ASSIGNMENT_DISPATCH` -> assignment claimed or explicitly declined
- `REVIEW_REQUEST` -> review resolved
- `REWORK_REQUEST` -> follow-up handoff submitted or assignment released
- `CI_INCIDENT` -> CI recovered, superseded, or work item cancelled
- `BLOCKER` -> blocker resolved, escalated into proposal, or work item cancelled
- `PROPOSAL` -> proposal resolved
- `PEER_MESSAGE` -> target replied, acknowledged as non-actionable, or linked issue resolved
- `MENTION` -> target responded in thread, explicitly acked, or a stronger inbox item replaced it

#### `EXPIRED`

Move an item to `EXPIRED` when:

- token/access grant naturally expires
- due time passes and the action is no longer relevant
- a newer superseding inbox item replaces it

#### `CANCELLED`

Move an item to `CANCELLED` when:

- the parent work item is cancelled
- the assignment is released before the action starts
- the associated thread is invalidated by a higher-level state change

### 6.4 Inbox supersession

To prevent pile-up:

- only one active inbox item of the same `kind + refType + refId + target` should normally exist
- newer higher-priority items may supersede older ones
- superseded items should become `EXPIRED`, not silently disappear

Examples:

- a second `CI_INCIDENT` on the same assignment supersedes the previous unresolved CI inbox item
- a fresh `REWORK_REQUEST` supersedes an older stale one after packet rebase

### 6.5 `ownerActionType` rule

`ownerActionType` is the normalized answer to:
"what does the target need to do next?"

It is intended for:

- project board rendering
- runtime resume logic
- inbox grouping and dedup
- automation metrics

Rules:

- every actionable inbox item should have exactly one `ownerActionType`
- multiple inbox `kind` values may map to the same action type
- the runtime should branch first on `ownerActionType`, then inspect detailed kind / thread / payload

Examples:

- `ASSIGNMENT_DISPATCH` -> `CLAIM_ASSIGNMENT`
- `REVIEW_REQUEST` -> `REVIEW_ARTIFACT`
- `CI_INCIDENT` -> `FIX_CI`
- `PEER_MESSAGE(requiresAck=true)` -> `RESPOND_TO_PEER`
- `TASK_PACKET_REBASED` follow-up -> `RESUME_AFTER_REBASE`
- `ACCESS_REVOKED` -> `STOP_WORK`

## 7. Message Delivery Rules

### 7.1 Message targets

A message may target:

- one member
- one runtime
- everyone holding a role
- everyone attached to a work item
- everyone in a thread

### 7.2 Message visibility

By default:

- messages attached to a work item are visible to members who can read that work item
- direct member-to-member messages still remain project-auditable
- sensitive human-only threads may require a visibility flag

Recommended visibility modes:

- `THREAD_VISIBLE`
- `ROLE_VISIBLE`
- `SENDER_AND_TARGET_ONLY`
- `HUMAN_ONLY`

### 7.3 Audit boundary

The system should be explicit about what the project owner can audit.

Recommended rule:

- the project owner may audit all agent-involved messages
- the project owner may audit all messages attached to project-affecting threads
  such as work items, reviews, blockers, CI incidents, and proposals
- truly private human-only threads are allowed, but only if:
  - all participants are human
  - the thread is marked `HUMAN_ONLY`
  - no agent instruction or project-state transition is carried only in that private thread

If a human-only thread results in a project-affecting decision, that decision must be restated into:

- a proposal
- a review
- a blocker resolution
- a memory entry
- or another auditable project object

This preserves private human discussion without making project execution depend on invisible side channels.

### 7.4 When a message should create an inbox item

Create an inbox item only if at least one is true:

- `requiresAck = true`
- `messageType = ALERT`
- target is currently offline and action is likely needed
- message is first in a new blocker / CI / review thread

Otherwise the message should remain visible in thread history without inbox fan-out.

### 7.5 Boundary between `message` and `review`

This boundary must stay sharp, otherwise the system becomes ambiguous.

Use `ProjectMessage` when:

- the sender wants to ask, warn, clarify, or coordinate
- the target may reasonably respond conversationally
- no formal quality decision has been made yet

Use `Review` when:

- the platform needs an approval or rejection outcome
- acceptance criteria are being evaluated
- the result should alter work-item state
- the result should be counted in quality metrics

Recommended rule:

- if the sender wants to say "please look at this"
  -> `message`
- if the sender wants to say "this artifact passes / fails the bar"
  -> `review`

Examples:

- "I think this migration is unsafe" -> `message`
- "Please change these two files before approval" -> `review.resolve(CHANGES_REQUESTED)`
- "Can you explain why you changed this endpoint?" -> `message`
- "This handoff is rejected because acceptance criterion #3 is unmet" -> `review`

### 7.6 Allowed promotion path

Messages may promote into stronger objects, but not the reverse.

Allowed upgrades:

- `message` -> `blocker`
- `message` -> `review request`
- `message` -> `proposal`
- `message` -> `CI incident thread`

Not allowed:

- replacing a `review.resolve` with only a message
- replacing a proposal approval with only a message reply
- replacing a final handoff with a message

## 8. Wake Policy

Wake policy should be rule-based and conservative.

### 8.1 Wake levels

#### `NONE`

- no wake signal
- visible only in project history

Use for:

- passive notes
- low-priority activity feed messages

#### `NEXT_ENTRY`

- no active push
- item waits in inbox until the participant next enters the project

Use for:

- low urgency peer messages
- FYI updates
- non-blocking comments

#### `SOFT_WAKE`

- one push attempt to the runtime or provider queue
- no escalation if missed

Use for:

- assignment dispatch
- review request
- non-urgent rework request
- clarifying question on active work

#### `HARD_WAKE`

- immediate push with retries
- may escalate to lead or owner if unreachable

Use for:

- CI failure on active work
- blocked protected-branch merge
- owner approval needed
- token revoked mid-assignment
- repeated review rejection

### 8.2 Wake routing

Wake target should be chosen in this order:

1. active runtime if known and healthy
2. fallback runtime for the same member if configured
3. provider dispatch queue
4. lead or owner escalation if wake repeatedly fails and the issue is urgent

### 8.3 Wake deduplication

To avoid storm behavior:

- merge duplicate wakes for same `refType/refId/kind/target`
- set a minimum retry backoff
- suppress repeat soft wakes if unread inbox item already exists

## 9. Re-entry and Catch-up Contract

This is the most important runtime rule for cloud agents.

### 9.1 Re-entry goals

On re-entry, an agent should:

- know what requires attention first
- avoid replaying the entire project timeline
- re-establish only the context it needs

### 9.2 Resume order

The default project resume flow should be:

1. validate token / access grant
2. read `ParticipantPresence` and register new heartbeat
3. read active inbox items ordered by urgency
4. read active assignments
5. read unread project events since cursor
6. fetch any referenced task packets
7. fetch referenced memories and artifacts
8. ack or defer inbox items
9. choose next action

### 9.3 Re-entry output

The result of re-entry should be an explicit local decision:

- `resume_assignment`
- `review_requested_artifact`
- `respond_to_message`
- `handle_ci_incident`
- `wait_for_more_work`
- `escalate_missing_context`

The platform should not assume the next action silently.

### 9.4 Re-entry failure cases

If re-entry fails because:

- token expired
- visibility changed
- assignment was released
- referenced thread was closed

then the agent should receive a structured failure response and the board should reflect it.

### 9.5 Packet rebase and inbox interaction

`TASK_PACKET_STALE` and `TASK_PACKET_REBASED` should not blindly create inbox spam.

Rules:

- emit `TASK_PACKET_STALE` as a project event every time material context becomes outdated
- create a new inbox item only if the assignee must actively reconsider the next action
- if the rebase preserves the same action type, prefer updating the existing active inbox item
  with the latest packet reference rather than creating a second active item
- if the rebase changes the required action type, expire the old inbox item and create a new one

Recommended examples:

- acceptance criteria wording improved, but worker should still continue same task
  -> no new inbox item; existing dispatch/rework item may update its packet ref
- CI failed and the worker must switch from normal implementation to repair mode
  -> create or replace with `ownerActionType=FIX_CI`
- review changes request arrives while old dispatch inbox item is still open
  -> supersede old dispatch item with new `REWORK_REQUEST`

### 9.6 Rebase update policy

Use this decision table:

- `same assignee + same action type + same thread`
  -> update existing inbox item in place
- `same assignee + different action type`
  -> expire old item, create new item
- `different assignee`
  -> old item cancelled or expired, new item created for new target
- `access revoked`
  -> all action items for the revoked runtime become `CANCELLED` or `EXPIRED`, and a terminal `STOP_WORK` inbox item is created

## 10. Canonical Coordination Flows

### 10.1 Agent A finds a code issue in Agent B's work

Recommended flow:

1. A posts `ProjectMessage(type=ALERT)` on the relevant work-item or review thread.
2. Platform creates `ProjectInboxItem(kind=PEER_MESSAGE)` for B.
3. Wake policy:
   - `SOFT_WAKE` if B has active assignment on same work item
   - `NEXT_ENTRY` otherwise
4. B re-enters and decides:
   - reply with clarification
   - patch directly
   - ask reviewer / lead for arbitration

Do not force every peer issue into formal `REVIEW_REJECTED`.

If the issue becomes a formal acceptance decision, it must escalate into `review`, not remain only as a message.

### 10.2 Reviewer requests changes from worker

1. Reviewer resolves review as `CHANGES_REQUESTED`.
2. Platform emits `ProjectEvent(REVIEW_RESOLVED)`.
3. Platform generates `ProjectInboxItem(kind=REWORK_REQUEST)`.
4. Platform generates fresh L3 packet with:
   - review note
   - changed acceptance focus
   - linked evidence
5. Worker is soft-woken or hard-woken depending on urgency and active state.

### 10.3 CI failure returns to project board

1. GitHub webhook ingests failure as `ExternalEvent(ci_failed)`.
2. Platform maps it into `ProjectEvent(CI_FAILED)`.
3. Platform creates a `CI_INCIDENT` thread if one does not exist.
4. Platform creates inbox item for active assignee.
5. Platform attaches failure summary, logs, and relevant external links.
6. Project board shows:
   - work item = needs revision
   - CI incident present
   - assignee wake pending / resumed / failed

### 10.4 Main agent dispatches a cloud runtime

1. An external provisioning flow makes a cloud runtime available.
2. Platform registers or activates `AgentRuntime`.
3. Platform issues access grant and access token.
4. Platform creates `ASSIGNMENT_DISPATCH` inbox item.
5. Platform sends dispatch wake to runtime/provider.
6. Cloud runtime enters project and acknowledges dispatch.
7. Board shows:
   - assigned
   - entered
   - running
   - waiting
   - disconnected

## 11. Board and UX Expectations

The project board should visualize more than work-item status.

For each agent or assignment, show:

- assigned member / runtime
- presence (`ACTIVE`, `IDLE`, `OFFLINE`, `UNREACHABLE`)
- latest inbox state
- latest message status
- last heartbeat time
- wake state (`NONE`, `SOFT_WAKE_SENT`, `HARD_WAKE_RETRYING`, `FAILED`)
- current top actionable item

For each work item, show:

- open messages count
- open inbox items count
- review pending?
- CI incident pending?
- blocked by human / blocked by agent / blocked by external system

This is especially important for cloud workers because humans need confidence that the runtime really entered the project and is progressing.

## 12. MCP / API Surface Additions

The existing v2 MCP surface should be extended with project-local coordination tools.

### 12.1 Read tools

```ts
inbox.list(input: {
  projectId: string;
  status?: "UNREAD" | "READ" | "ACKED";
  limit?: number;
}): InboxItem[]

message.list(input: {
  projectId: string;
  threadRefType?: string;
  threadRefId?: string;
  sinceId?: string;
  limit?: number;
}): Message[]

presence.get(input: {
  projectId: string;
  memberId?: string;
  runtimeId?: string;
}): Presence
```

### 12.2 Write tools

```ts
message.send(input: {
  projectId: string;
  targetType: "MEMBER" | "ROLE" | "ASSIGNMENT" | "WORK_ITEM" | "THREAD";
  targetRef: string;
  threadRefType: string;
  threadRefId: string;
  messageType: "NOTE" | "QUESTION" | "ALERT" | "REPLY" | "STATUS_UPDATE";
  content: string;
  requiresAck?: boolean;
}): Message

inbox.ack(input: {
  inboxItemId: string;
  note?: string;
}): InboxItem

inbox.defer(input: {
  inboxItemId: string;
  until?: string;
  note?: string;
}): InboxItem

presence.heartbeat(input: {
  projectId: string;
  runtimeId: string;
  state: "IDLE" | "ACTIVE" | "SLEEPING";
}): void

runtime.resumeProject(input: {
  projectId: string;
}): {
  inbox: InboxItem[];
  assignments: Assignment[];
  unreadEvents: ProjectEvent[];
  taskPackets: TaskPacket[];
}
```

## 13. Permission Notes

Messaging should be scoped.

### 13.1 Workers may

- message peers on linked work items
- reply in threads they can already read
- ack inbox items assigned to themselves

### 13.2 Workers may not

- broadcast to whole project by default
- wake unrelated members
- message across projects

### 13.3 Leads may

- message any member in the project
- create assignment dispatches
- escalate wake failures

### 13.4 Human owners may

- receive everything relevant
- optionally mute non-urgent thread messages

## 14. Test Scenario Seeds

These are the first focused tests this document should drive.

### M1. Dispatch wakes cloud worker once

- dispatch inbox item is created
- runtime receives soft wake
- worker enters and acks dispatch
- duplicate wake is suppressed

### M2. Peer note does not spam inbox

- A sends low-priority note to B
- B sees message in thread
- no inbox item created because `requiresAck=false`

### M3. Peer alert creates actionable inbox item

- A sends alert with `requiresAck=true`
- B gets inbox item
- B is soft-woken if active

### M4. Review changes request rebuilds worker context

- reviewer requests changes
- worker gets inbox item + refreshed L3 packet
- worker re-enters and resumes same assignment

### M5. CI failure hard-wakes active worker

- CI failure event arrives
- inbox item created
- worker hard-woken
- board shows wake retry state until acknowledged

### M6. Token revoked during execution

- access revoked
- write call denied
- runtime receives urgent inbox signal
- lead sees escalation item

### M7. Re-entry reads inbox before event backlog

- worker has 200 unread events but one urgent inbox item
- `resumeProject` returns inbox first
- worker processes urgent action without replaying all history

## 15. Recommended Next Step

After this document, the next best design note is:

- `project-platform-v2-agent-test-scenarios.md`

That document should turn:

- the behavior catalog
- this inbox/messaging design

into executable acceptance scenarios, fixture requirements, and expected board states.
