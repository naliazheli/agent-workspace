# agent-workspace — V1 Schema Shortlist

> Status: Draft
> Purpose: define the minimum durable data model for the first usable version of `agent-workspace`, separating must-have persisted objects from read models, derived objects, and deferred tables.
> Related: `agent-workspace-minimal-service-api.md`, `agent-workspace-auth-and-authorization-model.md`, `project-platform-v2-collab-design.md`

---

## 1. Why This Document Exists

The project-collaboration design now has enough concepts that it is easy to overbuild the first schema.

V1 should not attempt to persist every conceptual object on day one.

Instead, it should answer three questions:

1. which objects are mandatory durable truth
2. which objects can be computed or projected from that truth
3. which objects should wait until later phases

This document is the first-pass answer.

## 2. Schema Selection Rule

Use this rule when deciding whether an object needs its own persisted table in v1:

- persist it if losing it would break project coordination truth, audit, or re-entry
- project it if it is mainly for board or query convenience
- defer it if the product can work without it in the first coordination loop

Another way to say it:

- **must-store** = the service cannot function correctly without it
- **projection** = the service can function, but reads become slower or less friendly
- **defer** = useful later, not required for the first real workflow

## 3. V1 Must-Store Objects

These are the durable objects that should exist in the first real schema.

### 3.1 Core project tree

- `Project`
- `ProjectMember`
- `ProjectGoal`
- `ProjectFeature`
- `ProjectWorkItem`
- `ProjectAssignment`
- `ProjectArtifact`
- `ProjectReview`
- `ProjectMemory`

Reason:

- these are the execution backbone inherited from v1
- without them there is no real project coordination surface

### 3.2 Coordination truth

- `ProjectProposal`
- `ProjectEvent`
- `ProjectInboxItem`
- `ProjectMessage`
- `ProjectThread`

Reason:

- these are the collaboration primitives that make the system different from a plain project tracker
- they carry approvals, event history, coordination state, and actionable queues

### 3.3 Runtime and access

- `AgentRuntime`
- `ProjectAccessGrant`
- `ParticipantPresence`

Reason:

- runtime identity and scoped entry are core to the service
- presence is needed for wake/re-entry behavior and board visibility

Note:

- `ProjectAccessToken` does not need to be a durable table in v1 if the service uses signed short-lived tokens backed by grant checks

### 3.4 External signal durability

- `ExternalEvent`
- `ExternalLink`

Reason:

- CI/PR feedback is a core scenario, not a later nice-to-have
- links to external repos/PRs/issues should survive restarts and support audit

## 4. V1 Projection / Derived Objects

These should exist as service responses or internal read models, but do not necessarily need their own first-class tables in v1.

### 4.1 Board-oriented read models

- `BoardSummary`
- `MemberRuntimeSummary`
- `ReviewQueueSummary`
- `ProposalQueueSummary`
- `InboxSummary`
- `BlockerSummary`
- `CIIncidentSummary`

Reason:

- these are optimized views for host products
- they can be computed from base truth at first, then materialized later if needed

### 4.2 Derived execution objects

- `TaskPacket`
- `HandoffPackage` as a distinct object separate from artifact storage

Reason:

- both are important concepts
- but in v1 they can be represented as:
  - generated packet payload from current durable state
  - a `ProjectArtifact` of handoff type plus structured metadata

If performance or auditing pressure grows later, they can become dedicated durable objects.

### 4.3 Inbox / wake internals

- wake delivery attempts
- inbox supersession chain
- rebase explanation bundle

Reason:

- these are implementation details of coordination delivery
- the first service can expose outcomes without persisting every internal mechanism

## 5. V1 Deferred Objects

These are explicitly useful, but should not block the first implementation.

### 5.1 Product-analytics style rollups

- `ProjectMetricSnapshot`

Reason:

- very useful for PM automation and dashboards
- not required to prove core dispatch/re-entry/review/CI loop

The host product can compute simple live metrics first, or the service can derive lightweight summaries without a dedicated snapshot table.

### 5.2 Notification gateway tables inside core service

- `NotificationChannel`
- `NotificationDelivery`

Reason:

- they belong more naturally to a separate IM gateway or notification subsystem
- `agent-workspace` only needs to emit intent to notify in v1

If a reference implementation bundles notifications in one deploy at first, keep the data boundary logically separate.

### 5.3 Rich runtime accounting internals

- runtime billing records
- marketplace pricing tables
- cloud procurement state

Reason:

- these belong to host products or adjacent systems, not the collaboration core

### 5.4 Advanced audit extras

- token issuance history as a first-class table
- fine-grained wake receipt history
- delivery receipt ledger for every inbox transition

Reason:

- good future hardening work
- not required for the first product loop if core audit events already exist in `ProjectEvent` and service logs

## 6. Recommended V1 Table Groups

The first actual schema can be organized into five groups.

### 6.1 `project_core_*`

- projects
- members
- goals
- features
- work_items
- assignments
- artifacts
- reviews
- memory

### 6.2 `project_coordination_*`

- proposals
- events
- inbox_items
- messages
- threads

### 6.3 `project_runtime_*`

- runtimes
- access_grants
- participant_presence

### 6.4 `project_external_*`

- external_links
- external_events

### 6.5 `project_read_models_*` (optional later)

- board summaries
- queue summaries
- member runtime summaries

These can start as SQL views, cached queries, or service projections instead of first-class tables.

## 7. First-Pass Minimal Table Set

If V1 has to be extremely small, this is the narrowest table set that still preserves the main product loop:

- `Project`
- `ProjectMember`
- `ProjectGoal`
- `ProjectFeature`
- `ProjectWorkItem`
- `ProjectAssignment`
- `ProjectArtifact`
- `ProjectReview`
- `ProjectProposal`
- `ProjectEvent`
- `ProjectInboxItem`
- `ProjectMessage`
- `ProjectThread`
- `AgentRuntime`
- `ProjectAccessGrant`
- `ParticipantPresence`
- `ExternalEvent`
- `ExternalLink`

This set is enough to support:

- host creates project
- lead dispatches assignment
- runtime enters with scoped grant
- runtime reads inbox and works
- peer/reviewer communicates through thread/message/review
- CI failure comes back through external event
- board is rendered from base tables plus derived query logic

## 8. Suggested V1 Columns That Matter Most

This is not a full schema, but these column families should not be skipped.

### 8.1 On coordination records

Ensure these exist on the relevant coordination tables:

- `projectId`
- `refType`
- `refId`
- `createdAt`
- `createdByMemberId` or actor equivalent
- `status`

Reason:

- almost every board and audit query depends on these anchors

### 8.2 On runtime/access records

Ensure these exist:

- `runtimeId`
- `memberId`
- `projectId`
- `status`
- `scopes`
- `issuedAt`
- `expiresAt`
- `lastSeenAt`

Reason:

- re-entry, revocation, and visibility all depend on them

### 8.3 On event records

Ensure:

- monotonic per-project sequence or equivalent cursor field
- event type
- causal reference back to the object/event being described

Reason:

- event stream quality determines how well runtimes can catch up

## 9. Schema Anti-Patterns To Avoid In V1

### 9.1 Do not persist every view as a table

Avoid adding separate durable tables for:

- board cards
- queue cards
- member widgets

until query or scale pressure proves they are needed.

### 9.2 Do not duplicate the same truth across coordination objects

Examples:

- review decision should not also become a separate mutable message record of truth
- inbox state should not become the only source of assignment state

Keep one durable owner of each piece of truth.

### 9.3 Do not make packet storage mandatory too early

If packet generation can be deterministic from assignment + memory + dependency state, keep it derived first.

Persist explicit packet versions later if needed for scale, reproducibility, or compliance.

### 9.4 Do not mix host-product economics into collaboration schema

Keep out of the core collaboration schema:

- wallet balance
- coin spend
- marketplace pricing
- cloud worker procurement cost

These belong outside the service boundary.

## 10. Relation To AgentCraft

For `agentcraft`, this shortlist means:

- the first extraction should focus on coordination truth tables
- board UI can still be rendered in `agentcraft`
- host-product economic tables remain outside `agent-workspace`
- a shared DB during transition is acceptable as long as the data groups remain logically separate

In other words:

- design the schema as if it belongs to a standalone service
- even if the first implementation still lands inside the `agentcraft` codebase

## 11. Recommended Next Step

After this shortlist, the next design step should be:

- a concrete V1 relational schema draft

That draft should include:

- table names
- primary/foreign keys
- important indexes
- enum strategy
- which fields are JSON vs normalized tables

At that point the design is ready to move from architecture into actual implementation planning.
