# agent-workspace — Auth And Authorization Model

> Status: Draft
> Purpose: define the trust model, principal types, grant/token lifecycle, and first-pass authorization rules for `agent-workspace` as a standalone project-collaboration service.

---

## 1. Why This Document Exists

`agent-workspace` is not just a project data API.

It is a coordination control plane where:

- host products create and manage projects
- runtimes enter projects and act with scoped authority
- external systems post project-affecting signals

So the service needs a clear answer to:

- who is calling
- on whose behalf they are acting
- what scope they actually have
- how that authority is revoked or expires

This document provides that answer.

## 2. Principal Types

There are three first-class authenticated principals in v1.

### 2.1 `HostClient`

Represents a trusted host product backend.

Examples:

- `agentcraft` backend
- another project console backend

What it can do:

- create and read projects
- issue access grants
- dispatch assignments
- read board and member summaries
- ingest external events on behalf of the host

What it does **not** mean:

- it is not automatically a project owner
- it is not itself a runtime participant

It acts either:

- with its own host-level authority
- or with delegated user/member context supplied by the host

### 2.2 `ProjectRuntime`

Represents a concrete runtime currently acting inside a project.

Examples:

- a Codex runtime
- a Claude Code runtime
- a Hermes runtime
- a cloud worker runtime

What it can do:

- resume project work
- read scoped inbox/items/threads
- send project messages
- heartbeat presence
- submit artifacts, handoffs, reviews, proposals if its grant allows

What it cannot do by default:

- read all project data
- administer grants
- impersonate the host product

Its authority always comes from a `ProjectAccessGrant` and a short-lived `ProjectAccessToken`.

### 2.3 `ExternalIntegrationClient`

Represents a trusted integration actor that posts external signals.

Examples:

- GitHub webhook bridge
- CI incident bridge
- PR sync worker

What it can do:

- ingest normalized external events
- post CI incident signals

What it should not do:

- read board state
- dispatch assignments
- act as a project runtime

## 3. Trust Boundaries

The service should treat these as separate trust zones:

- host trust
- runtime trust
- external integration trust

They should not share tokens or session types.

Key rule:

- host credentials prove product/backend trust
- runtime tokens prove scoped project participation
- integration credentials prove source-system trust

Never let one principal type silently substitute for another.

## 4. Core Authorization Objects

### 4.1 `ProjectAccessGrant`

The durable authorization object.

It answers:

- which project
- which member
- which runtime
- which scopes
- which skill bundle refs
- why issued
- when it expires

It is the durable source of truth for runtime authorization.

### 4.2 `ProjectAccessToken`

The short-lived bearer token derived from an active grant.

It answers:

- who the runtime is
- which project it may act in
- which scopes it currently holds
- when the token expires

It should be easy to rotate and cheap to invalidate by checking the underlying grant state.

### 4.3 Host session / host credential

The host-side trust object.

This may be implemented as:

- client credentials
- signed service JWT
- mTLS-backed identity

The exact mechanism can vary, but the semantic meaning stays the same:

- the caller is a trusted host product backend

### 4.4 Integration credential

The external-ingestion trust object.

This may be implemented as:

- webhook secret
- signed service JWT
- dedicated integration key

The integration principal should be narrower than `HostClient`.

## 5. Delegation Model

### 5.1 Host acts as host, not as runtime

When a host product calls:

- `POST /v1/projects`
- `GET /v1/projects/{projectId}/board`
- `POST /v1/projects/{projectId}/assignments`

it is acting as `HostClient`.

It may include delegated user context such as:

- `ownerUserId`
- `actingUserId`
- `actingMemberId`

But this delegated context should be auditable metadata, not a replacement for host authentication.

### 5.2 Runtime acts only from grant-derived scope

A runtime should never gain authority because the host happens to trust it.

Instead:

1. host or authorized project actor issues a `ProjectAccessGrant`
2. runtime receives a short-lived `ProjectAccessToken`
3. runtime calls service APIs using that token
4. service validates both token and underlying grant status

### 5.3 Integration actors stay narrow

GitHub/CI integrations should be able to ingest facts, but should not become general-purpose project clients.

That means:

- event ingestion uses integration credentials
- board reads still require host/runtime principals

## 6. Grant Lifecycle

The grant lifecycle should be explicit.

### 6.1 `PENDING`

Grant is created but not yet usable.

Typical reasons:

- runtime not registered yet
- host prepared a dispatch before runtime entry

### 6.2 `ACTIVE`

Grant is valid and can mint or validate runtime access tokens.

### 6.3 `EXPIRED`

Grant naturally timed out.

Effect:

- no new tokens should be minted
- existing tokens should fail after their own short TTL or on grant-status check

### 6.4 `REVOKED`

Grant was manually or automatically revoked.

Typical triggers:

- assignment cancelled
- runtime removed from project
- owner or lead rescinds access
- security concern

Effect:

- token refresh fails immediately
- in-flight runtime actions should be rejected
- open inbox items may be cancelled or superseded by `ACCESS_REVOKED` / `STOP_WORK`

## 7. Token Lifecycle

### 7.1 Mint

Token minted from an active grant.

Suggested payload fields:

- `projectId`
- `memberId`
- `runtimeId`
- `grantId`
- `role`
- `scopes`
- `skillBundleRefs`
- `exp`

### 7.2 Use

Runtime uses the token to:

- resume project
- read inbox
- send message
- heartbeat
- submit work

### 7.3 Refresh

Refresh should re-check:

- grant still active
- runtime still bound to the same member/project context
- no stronger revocation or downgrade applies

### 7.4 Revoke

Token revocation should primarily flow through grant revocation.

Design preference:

- revoke the durable grant
- keep tokens short-lived
- reject requests if token is valid cryptographically but grant is no longer active

This avoids needing an always-growing token blacklist as the primary mechanism.

## 8. Scope Model

Scopes should remain semantic and small in v1.

Recommended v1 scopes:

- `PROJECT_READ_BASIC`
- `PROJECT_BOARD_READ`
- `PROJECT_MEMBER_READ`
- `PROJECT_INBOX_READ`
- `ASSIGNMENT_DISPATCH`
- `THREAD_PARTICIPATE`
- `REVIEW_SUBMIT`
- `PROPOSAL_CREATE`
- `ACCESS_GRANT_ISSUE`
- `EXTERNAL_EVENT_INGEST`

Important distinction:

- host products may hold broad project-management scopes
- runtimes should normally hold only assignment/thread-linked scopes plus a small action set

Internal ACLs may still be more detailed than external scopes.

## 9. Default Authorization Posture

### 9.1 Host default

Host products can be broadly trusted at the service boundary, but each operation should still be checked for:

- project visibility
- delegated owner/member context where relevant
- tenant/environment boundaries

### 9.2 Runtime default

Runtimes start narrow.

Default runtime posture:

- no implicit `PROJECT_WIDE`
- no grant administration
- no unrestricted member visibility
- no proposal/review authority unless explicitly granted

### 9.3 External integration default

External integrations stay write-narrow:

- yes to `EXTERNAL_EVENT_INGEST`
- no to project read models
- no to runtime operations

## 10. Revocation And Downgrade Rules

Revocation must be visible in collaboration state, not only in security logs.

When a runtime grant is revoked or downgraded:

- runtime refresh should fail
- subsequent write actions should fail
- stale packet may be emitted if current packet no longer matches access scope
- inbox items that require the old scope should be cancelled or expired
- project may generate a replacement inbox item for reassignment or stop-work

This is why auth and coordination cannot be designed separately.

## 11. Audit Requirements

All privileged actions should be auditable with:

- principal type
- principal id
- delegated acting user/member if applicable
- project id
- target object
- decision/result
- timestamp

Minimum auditable events:

- project create
- assignment dispatch
- grant issue
- grant revoke
- runtime register
- runtime resume
- review submit
- proposal create/resolve
- external event ingest

## 12. Recommended V1 Auth Flow Examples

### 12.1 Host creates project

1. `HostClient` authenticates with service credential
2. host calls `POST /v1/projects`
3. host includes delegated owner info
4. service records host principal + delegated owner context in audit trail

### 12.2 Host dispatches runtime

1. host calls `POST /v1/projects/{projectId}/assignments`
2. host calls `POST /v1/projects/{projectId}/access-grants`
3. runtime receives minted token or token-exchange path
4. runtime calls `POST /v1/runtimes/{runtimeId}/resume`

### 12.3 Runtime re-enters after wake

1. runtime wakes with existing valid token or refreshed token
2. runtime calls `resume`
3. service verifies token + grant + project scope
4. service returns scoped inbox, assignment, and thread summaries

### 12.4 GitHub CI posts failure

1. integration client authenticates with narrow credential
2. integration calls `POST /v1/projects/{projectId}/external-events`
3. service normalizes event, writes incident/inbox/event projections
4. no broader host/runtime privileges are implied

## 13. Non-Goals

This document does not try to decide:

- exact OAuth vendor choice
- exact JWT vs opaque-token implementation
- exact mTLS rollout
- exact multi-tenant deployment topology

It defines the semantic contract, not the final infra choice.
