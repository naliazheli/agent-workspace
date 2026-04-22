# AgentCraft Project Platform V2 — Agent Behavior Catalog

> Status: Draft
> Depends on: `project-platform-v2-collab-design.md`
> Purpose: enumerate concrete agent behaviors before locking message, permission, and test-case design.

---

## 1. Why This Document Exists

The v2 collaboration design defines the coordination skeleton:

- role contracts
- layered context (`L1` to `L4`)
- `ProjectEvent`
- `ProjectProposal`
- IM gateway
- concurrent assignment modes

What it does **not** yet define in enough detail is how agents actually behave inside a live project.

That gap matters because the next stage of platform validation is not "more tables" but:

1. list realistic agent behaviors
2. define what context and skills each behavior needs
3. define how agents notify, wake, and re-enter projects
4. turn those behaviors into end-to-end test cases

This document is the missing bridge.

## 2. Design Stance

The working assumption is correct:

- do **not** start by over-optimizing schema
- do **not** treat the platform as a single giant shared chat
- do model project collaboration as a set of explicit behaviors with contracts

The platform should be able to answer:

- How does an agent enter a project?
- What permissions does it receive?
- How does it know what to read first?
- How does it get woken up again?
- How does one agent notify another agent about a problem?
- How does CI feedback return into the same project loop?
- How do cloud agents join, work, report, and leave cleanly?

## 3. Behavior Modeling Principles

Every agent behavior should be specified with the same fields:

- `behaviorId`
- `actorRole`
- `trigger`
- `requiredReads`
- `requiredSkills`
- `writes`
- `notifications`
- `wakePolicy`
- `successExit`
- `failureExit`

Three rules:

1. A behavior should have one primary goal.
2. A behavior should read the smallest viable context slice.
3. A behavior should produce a machine-checkable outcome, not just free-form text.

## 4. Project Entry Model

This is the first major addition missing from v2.

### 4.1 Why entry must be explicit

Agents are not permanently resident in one project. They may:

- be created on demand
- be provisioned as cloud workers
- leave after an assignment ends
- re-enter later to continue work
- be woken by a message, CI failure, or review request

So "being a project member" and "currently active in the project" are different states.

### 4.2 New concepts

#### `ProjectAccessGrant`

Represents the authorization grant that allows a specific agent runtime to enter a project.

Suggested fields:

- `projectId`
- `memberId`
- `agentRuntimeId`
- `grantType` (`HUMAN_SESSION | LOCAL_AGENT | CLOUD_AGENT | SERVICE_AGENT`)
- `scopes`
- `skillBundleRefs`
- `status` (`PENDING | ACTIVE | EXPIRED | REVOKED`)
- `issuedAt`
- `expiresAt`
- `revokedAt`

#### `ProjectAccessToken`

Short-lived signed token given to the runtime when it is allowed to enter.

Suggested payload:

- `projectId`
- `memberId`
- `agentRuntimeId`
- `role`
- `capabilityTags`
- `allowedToolScopes`
- `skillBundleRefs`
- `eventCursorStart`
- `inboxCursorStart`
- `expiresAt`

This is not a payment token. It is an access token for project participation.

#### `AgentRuntime`

Represents the concrete execution identity of the agent currently running.

Suggested fields:

- `runtimeId`
- `provider` (`local | agentcraft_cloud | openai | anthropic | custom`)
- `model`
- `status`
- `wakeEndpoint`
- `lastSeenAt`

### 4.3 Entry lifecycle

```
DISCOVERED
  -> INVITED
  -> PROVISIONED
  -> TOKEN_ISSUED
  -> ENTERED_PROJECT
  -> IDLE
  -> ACTIVE
  -> PAUSED
  -> REENTERED
  -> RELEASED / REVOKED
```

### 4.4 Cloud-agent purchase flow

This is the scenario you described and should be explicitly first-class:

1. Lead agent or Owner decides a WorkItem needs a cloud worker.
2. An external provisioning or marketplace flow makes a `CLOUD_AGENT` runtime available.
3. The platform creates a `ProjectMember` or activates an existing one.
4. The platform issues a `ProjectAccessGrant` with:
   - project membership
   - role
   - capabilities
   - common `agent-project` skills
   - task-specific L3 packet reference
5. The platform sends the cloud runtime a dispatch message containing:
   - assignment id
   - project id
   - access token or callback to mint one
   - minimum context references
6. The cloud agent enters the project, pulls inbox + assignment + task packet, and starts work.
7. The project board shows:
   - assignment owner = cloud agent
   - runtime state = entered / active / waiting / blocked
   - latest heartbeat / message / run status

The purchase event itself should be recorded as a project event, not only as a finance event.

## 5. Permissions Model

The current v2 permission matrix is tool-centric. That is necessary but not sufficient.

We also need behavior-level permissions.

### 5.1 Permission layers

- `membership`
  Can the agent enter the project at all?
- `visibility`
  Which goals, work items, artifacts, and memories can it read?
- `action`
  Which MCP operations can it invoke?
- `messaging`
  Who can it notify directly?
- `delegation`
  Can it create or reassign work?
- `external`
  Can it create PRs, trigger CI, merge, or comment externally?

### 5.2 Recommended permission bundles

#### `worker.standard`

- read own assignments
- read linked dependencies
- read referenced shared memory
- write runs, artifacts, handoffs
- send peer messages only on linked work items
- no goal mutation
- no cross-project visibility

#### `reviewer.code`

- read target work item + artifacts + linked history
- write review resolution
- write memory after review
- send rework requests
- no reassignment powers

#### `lead.dispatch`

- create work items
- create assignments
- generate task packets
- send notifications
- propose scope changes

#### `cloud.worker.ephemeral`

- same as `worker.standard`
- token must be short-lived and revocable
- limited to one project
- limited to one or a bounded set of assignments

### 5.3 Permission rule

Permissions should be evaluated as:

`member role + capability tags + explicit scopes from token + project policy`

Not just role string alone.

## 6. Agent Inbox, Messages, and Wakeups

This is the second major addition missing from v2.

### 6.1 Why messages are needed

Agents need a lightweight coordination path in addition to:

- reviews
- handoffs
- proposals
- external events

Example:

- Agent A notices Agent B changed the wrong file.
- This is not yet a formal reject.
- A should be able to send a scoped project message to B.

### 6.2 New concepts

#### `ProjectInboxItem`

Actionable item for a member or runtime.

Suggested fields:

- `projectId`
- `targetMemberId`
- `targetRuntimeId?`
- `sourceMemberId`
- `kind` (`ASSIGNMENT`, `REVIEW_REQUEST`, `REWORK_REQUEST`, `CI_INCIDENT`, `BLOCKER`, `PEER_MESSAGE`, `PROPOSAL`, `MENTION`)
- `priority` (`LOW | NORMAL | HIGH | URGENT`)
- `refType`
- `refId`
- `summary`
- `status` (`UNREAD | READ | ACKED | DONE | EXPIRED`)
- `wakeHint` (`NONE | NEXT_ENTRY | SOFT_WAKE | HARD_WAKE`)
- `createdAt`

#### `ProjectMessage`

Lightweight communication inside the project.

Suggested fields:

- `projectId`
- `threadRefType`
- `threadRefId`
- `senderMemberId`
- `targetType` (`MEMBER | ROLE | ASSIGNMENT | WORK_ITEM`)
- `targetRef`
- `messageType` (`NOTE | QUESTION | ALERT | REPLY`)
- `content`
- `requiresAck`
- `createdAt`

### 6.3 Wake semantics

Not every event should wake a cloud agent.

Recommended wake levels:

- `NONE`
  Only visible on next entry
- `NEXT_ENTRY`
  Add to inbox, no active push
- `SOFT_WAKE`
  Push once to runtime or provider queue
- `HARD_WAKE`
  Immediate push + retry escalation

Use examples:

- FYI message -> `NEXT_ENTRY`
- peer code note -> `SOFT_WAKE`
- CI failed on active assignment -> `HARD_WAKE`
- proposal for human owner -> `HARD_WAKE`

### 6.4 Re-entry catch-up order

When an agent re-enters a project, it should not scan the full history.

Recommended bootstrap order:

1. validate token / grant
2. fetch active inbox items
3. fetch active assignments
4. fetch unread events since cursor
5. fetch relevant task packets
6. fetch referenced memory
7. fetch linked artifacts and external links

This should be the default "resume project" contract.

## 7. Behavior Catalog

The table below is the first pass at the behavior inventory that should drive test coverage.

| Behavior | Actor | Trigger | Minimum reads | Skills needed | Primary write | Notify / wake |
|---|---|---|---|---|---|---|
| `enter_project` | any agent | token issued or wake event | access grant, membership, inbox cursor | `agent-project.entry` | session heartbeat | none |
| `catch_up` | any agent | re-entry after absence | inbox, unread events, active assignments | `agent-project.catchup` | read ack / cursor advance | maybe ack sender |
| `claim_assignment` | worker | assignment available | assignment, task packet, work item status | domain skill + `agent-project.dispatch` | assignment claimed | lead sees active |
| `start_work` | worker | assignment claimed | L3 packet, dependencies, tool hints | domain skill | run started | board shows working |
| `ask_for_clarification` | worker | ambiguity detected | task packet, brief | communication + domain | project message or blocker | lead or owner soft wake |
| `report_progress` | worker | checkpoint or heartbeat timer | active run, work item | domain + reporting | run log / progress artifact | board update only |
| `submit_handoff` | worker | local objective reached | run result, evidence | domain + handoff discipline | handoff artifact | reviewer soft wake |
| `review_work` | reviewer | handoff submitted | artifact, criteria, linked memory | `review.code` / domain review | review result | worker soft or hard wake |
| `request_rework_from_peer` | reviewer or peer | issue found | target artifact, target work item | review + communication | inbox item + message | target agent soft wake |
| `peer_notify_code_issue` | worker | sees another agent problem | linked work item, message thread | communication | project message | target agent next-entry or soft wake |
| `react_to_ci_failure` | worker / integrator | external CI failed event | CI log, linked PR, work item | `github.ci`, debugging skill | inbox item + revised task packet | active worker hard wake |
| `propose_scope_change` | lead / worker | mismatch between task and reality | goal, feature, work item, memory | planning | proposal | owner hard wake |
| `raise_blocker` | any active agent | dependency or permission blocked | work item, dependency, message state | communication | blocker inbox item | lead hard wake |
| `delegate_subtask` | lead | work too broad or parallelizable | parent work item, capabilities | planning | child work item + assignment | new assignee wake |
| `provision_cloud_runtime` | lead / owner | not enough capacity | marketplace/catalog or provisioning result, capability need | resource planning | runtime provision + access grant | cloud runtime wake |
| `dispatch_cloud_runtime` | system / lead | cloud runtime provisioned | grant, access token, L3 packet | dispatch | assignment dispatch message | cloud runtime hard wake |
| `resume_after_message` | cloud worker | inbound wake | inbox item, referenced object | catchup + domain | ack + continued run | sender sees resumed |
| `escalate_to_human` | lead / pm / reviewer | repeated reject, budget, scope | proposal + recent events | governance | proposal | owner hard wake |
| `close_out_assignment` | lead / system | accepted, cancelled, lost race | review result, concurrency mode | project ops | assignment released | assignee next-entry |
| `leave_project` | any agent | task done or revoked | active assignments, inbox | project ops | session closed | board updates |

## 8. Context and Skill Requirements by Behavior Family

### 8.1 Entry / re-entry behaviors

Required context:

- token or grant
- project membership
- unread inbox items
- unread event cursor
- active assignments

Required common skills:

- `agent-project.entry`
- `agent-project.catchup`
- `agent-project.permissions`

### 8.2 Delivery behaviors

Required context:

- L3 task packet
- linked dependencies
- referenced memory only
- output contract

Required common skills:

- `agent-project.execute`
- `agent-project.handoff`
- one domain skill bundle such as `frontend.react`, `backend.nestjs`, `data.sql`

### 8.3 Coordination behaviors

Required context:

- message thread or review object
- relationship between sender and target
- urgency / blocker state

Required common skills:

- `agent-project.messaging`
- `agent-project.peer-review`
- `agent-project.blocker-management`

### 8.4 Governance behaviors

Required context:

- budget
- proposal rules
- escalation policy
- project autonomy settings

Required common skills:

- `agent-project.proposals`
- `agent-project.pm`
- `agent-project.governance`

## 9. Cloud-Agent Specific Design Notes

This is the third major addition required by your target product shape.

### 9.1 Cloud worker is not just another member row

A cloud worker needs all three:

- a `ProjectMember`
- an `AgentRuntime`
- a temporary `ProjectAccessToken`

Without all three, the board may know "who" the worker is, but the runtime cannot safely enter and act.

### 9.2 Cloud dispatch packet

When the main agent dispatches a cloud runtime, the dispatch payload should contain:

- `projectId`
- `memberId`
- `runtimeId`
- `assignmentId`
- `accessToken` or token-mint callback
- `taskPacketRef`
- `requiredSkillBundleRefs`
- `wakeReplyEndpoint`
- `expiry`

### 9.3 Board visibility for cloud workers

The project board should visibly distinguish:

- assigned to cloud agent
- cloud agent entered project
- cloud agent currently running
- waiting on review
- blocked on message
- disconnected / expired token

This is critical for human trust.

## 10. Missing Behaviors Still Worth Adding Later

The current catalog is enough to start tests, but later versions should also cover:

- `resolve_merge_conflict`
- `recover_from_stale_packet`
- `pair_program_with_peer_agent`
- `inherit_abandoned_assignment`
- `summarize_project_for_new_member`
- `self-audit_permissions_before_action`
- `contest_review_result`
- `archive_thread_after_resolution`

## 11. Test-Case Seed Matrix

These are the first test scenarios that should be written from the behavior model.

### T1. Cloud worker enters and starts work

- Lead provisions or requests a cloud worker from an external capacity source
- platform creates member + runtime + access token
- worker receives dispatch message
- worker enters project
- worker reads only inbox + assignment + L3 packet
- board shows worker as active

### T2. Peer issue notification

- Agent A sees a bug in B's change
- A sends a peer message linked to the work item
- B gets inbox item
- B re-enters and acknowledges
- B either patches directly or requests review clarification

### T3. CI failure loopback

- Worker opens PR
- CI webhook ingests failure
- platform creates `ExternalEvent` and project event
- platform writes `CI_INCIDENT` inbox item
- same worker is hard-woken
- worker gets fresh packet with log summary and repair objective

### T4. Rejoin after idle period

- Cloud worker leaves after first pass
- Reviewer requests changes
- worker is re-woken
- worker re-enters, reads inbox first, not full project history
- worker resumes same assignment with revised packet

### T5. Scope change and approval

- Worker finds task impossible under current goal
- worker raises blocker
- lead turns blocker into proposal
- owner approves through IM
- affected workers get wake signal and refreshed packets

### T6. Token revocation while active

- cloud worker token is revoked
- next write operation is denied
- board shows revoked / interrupted state
- lead gets urgent inbox item

## 12. Recommended Next Documents

This behavior catalog should be followed by two narrower design notes:

1. `project-platform-v2-agent-inbox-and-messaging.md`
   Focus on inbox items, threads, wake policies, and read/ack behavior.

2. `project-platform-v2-agent-test-scenarios.md`
   Convert the behavior catalog into executable acceptance scenarios and fixtures.

## 13. Recommended Minimal Changes Back Into v2

When you are ready to fold this back into the main collaboration design, the highest-value additions are:

- add `ProjectAccessGrant`
- add `ProjectAccessToken` semantics
- add `AgentRuntime`
- add `ProjectInboxItem`
- add `ProjectMessage`
- add re-entry bootstrap order
- add cloud-worker purchase / dispatch scenario as a first-class end-to-end flow

Until then, this document should be treated as the behavioral companion to v2.
