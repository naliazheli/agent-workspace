# agent-workspace — V1 Relational Schema Draft

> Status: Draft
> Purpose: turn the V1 schema shortlist into a concrete first-pass relational design suitable for Prisma or SQL implementation.
> Related: `agent-workspace-v1-schema-shortlist.md`, `agent-workspace-minimal-service-api.md`, `agent-workspace-auth-and-authorization-model.md`

---

## 1. Design Goals

This schema draft optimizes for:

- a real first implementation, not theoretical completeness
- clear service ownership boundaries
- safe re-entry and auditability
- practical queryability for host-product boards

It does **not** try to fully normalize every flexible object in v1.

Guiding choices:

- keep collaboration truth in durable core tables
- use JSON where shape is still evolving
- derive board/read models instead of persisting them first
- keep runtime auth state explicit

## 2. Naming Convention

Recommended SQL table names:

- `projects`
- `project_members`
- `project_goals`
- `project_features`
- `project_work_items`
- `project_assignments`
- `project_artifacts`
- `project_reviews`
- `project_memory`
- `project_proposals`
- `project_events`
- `project_inbox_items`
- `project_messages`
- `project_threads`
- `agent_runtimes`
- `project_access_grants`
- `participant_presence`
- `external_links`
- `external_events`

Recommended id format:

- string ids at the application layer
- ULID/UUID at storage layer

Examples:

- `proj_*`
- `pmem_*`
- `goal_*`
- `wi_*`
- `asn_*`

## 3. Shared Column Conventions

Most durable tables should use:

- `id`
- `project_id` when project-scoped
- `created_at`
- `updated_at`

When mutable lifecycle exists, also prefer:

- `status`
- `created_by_member_id`
- `updated_by_member_id`

When soft deletion or archival matters, prefer:

- `archived_at` or `closed_at`

Avoid generic `deleted_at` in v1 unless real soft-delete semantics are needed.

## 4. Core Execution Tables

### 4.1 `projects`

Purpose:

- top-level project container

Suggested columns:

- `id` PK
- `external_ref` nullable
- `name`
- `description` nullable
- `status` (`DRAFT | ACTIVE | PAUSED | ARCHIVED`)
- `owner_member_id` nullable
- `lead_member_id` nullable
- `source_type` nullable
- `source_payload_json` nullable
- `settings_json` nullable
- `created_at`
- `updated_at`

Indexes:

- unique on `external_ref` when present and scoped by host/tenant if needed
- index on `status`

### 4.2 `project_members`

Purpose:

- project membership and role anchor

Suggested columns:

- `id` PK
- `project_id` FK
- `user_ref` nullable
- `display_name`
- `role` (`OWNER | LEAD | PLANNER | WORKER | REVIEWER | PM | INTEGRATOR | OBSERVER`)
- `capability_tags_json` nullable
- `status` (`ACTIVE | INVITED | SUSPENDED | REMOVED`)
- `joined_at`
- `left_at` nullable
- `metadata_json` nullable
- `created_at`
- `updated_at`

Indexes:

- unique on (`project_id`, `user_ref`) when `user_ref` is present
- index on (`project_id`, `role`)
- index on (`project_id`, `status`)

### 4.3 `project_goals`

Suggested columns:

- `id` PK
- `project_id` FK
- `title`
- `description`
- `status` (`OPEN | IN_PROGRESS | BLOCKED | DONE | CANCELLED`)
- `priority` nullable
- `sort_order` nullable
- `created_by_member_id` nullable
- `closed_reason` nullable
- `created_at`
- `updated_at`

Indexes:

- index on (`project_id`, `status`)
- index on (`project_id`, `sort_order`)

### 4.4 `project_features`

Suggested columns:

- `id` PK
- `project_id` FK
- `goal_id` FK
- `title`
- `description` nullable
- `status` (`OPEN | IN_PROGRESS | BLOCKED | DONE | CANCELLED`)
- `priority` nullable
- `sort_order` nullable
- `created_by_member_id` nullable
- `created_at`
- `updated_at`

Indexes:

- index on (`project_id`, `goal_id`)
- index on (`project_id`, `status`)

### 4.5 `project_work_items`

Suggested columns:

- `id` PK
- `project_id` FK
- `goal_id` nullable FK
- `feature_id` nullable FK
- `title`
- `description` nullable
- `status` (`OPEN | READY | IN_PROGRESS | NEEDS_REVISION | BLOCKED | ACCEPTED | CANCELLED`)
- `priority` nullable
- `concurrency_mode` (`SINGLE | RACE | PRIMARY_BACKUP | PAIR`)
- `acceptance_criteria_json` nullable
- `required_capabilities_json` nullable
- `dependency_refs_json` nullable
- `created_by_member_id` nullable
- `created_at`
- `updated_at`

Indexes:

- index on (`project_id`, `feature_id`)
- index on (`project_id`, `status`)
- index on (`project_id`, `concurrency_mode`)

### 4.6 `project_assignments`

Suggested columns:

- `id` PK
- `project_id` FK
- `work_item_id` FK
- `assignee_member_id` nullable FK
- `target_runtime_id` nullable FK to `agent_runtimes`
- `status` (`PROPOSED | DISPATCHED | ACTIVE | PAUSED | NEEDS_INPUT | COMPLETED | RELEASED | CANCELLED`)
- `title`
- `objective_summary` nullable
- `required_scopes_json` nullable
- `skill_bundle_refs_json` nullable
- `packet_version` integer default 1
- `current_packet_state` (`ACTIVE | STALE | SUPERSEDED`)
- `due_at` nullable
- `released_reason` nullable
- `created_by_member_id` nullable
- `created_at`
- `updated_at`

Indexes:

- index on (`project_id`, `work_item_id`)
- index on (`project_id`, `assignee_member_id`, `status`)
- index on (`target_runtime_id`, `status`)
- index on (`project_id`, `status`)

Note:

- `TaskPacket` remains derived in v1, but packet version/state should still live on assignment for re-entry safety.

### 4.7 `project_artifacts`

Suggested columns:

- `id` PK
- `project_id` FK
- `assignment_id` nullable FK
- `work_item_id` nullable FK
- `artifact_type` (`HANDOFF | REPORT | PATCH | LINK_BUNDLE | TEST_RESULT | OTHER`)
- `title`
- `summary` nullable
- `content_json` nullable
- `external_url` nullable
- `status` (`DRAFT | SUBMITTED | ACCEPTED | REJECTED | SUPERSEDED`)
- `submitted_by_member_id` nullable
- `created_at`
- `updated_at`

Indexes:

- index on (`project_id`, `assignment_id`)
- index on (`project_id`, `artifact_type`)
- index on (`project_id`, `status`)

### 4.8 `project_reviews`

Suggested columns:

- `id` PK
- `project_id` FK
- `assignment_id` nullable FK
- `artifact_id` nullable FK
- `reviewer_member_id` nullable FK
- `decision` (`PENDING | APPROVED | REQUEST_CHANGES | REJECTED`)
- `summary`
- `details_json` nullable
- `thread_id` nullable FK
- `resolved_at` nullable
- `created_at`
- `updated_at`

Indexes:

- index on (`project_id`, `assignment_id`)
- index on (`project_id`, `decision`)
- index on (`reviewer_member_id`, `decision`)

### 4.9 `project_memory`

Suggested columns:

- `id` PK
- `project_id` FK
- `memory_type` (`DECISION | FACT | LESSON | RISK | CONTEXT | REVIEW_OUTCOME`)
- `title`
- `content`
- `tags_json` nullable
- `source_ref_type` nullable
- `source_ref_id` nullable
- `visibility_scope` (`PROJECT_WIDE | THREAD_LINKED | ASSIGNMENT_LINKED`)
- `created_by_member_id` nullable
- `created_at`

Indexes:

- index on (`project_id`, `memory_type`)
- index on (`project_id`, `source_ref_type`, `source_ref_id`)

## 5. Coordination Tables

### 5.1 `project_proposals`

Suggested columns:

- `id` PK
- `project_id` FK
- `proposal_type` (`GOAL_DEFINITION | GOAL_CHANGE | GOAL_CLOSE | GOAL_REOPEN | REASSIGN | SCOPE_CHANGE | MEMBER_INVITE | OTHER`)
- `title`
- `summary`
- `payload_json`
- `status` (`PENDING | APPROVED | REJECTED | EXPIRED | CANCELLED`)
- `created_by_member_id` nullable
- `approver_member_ids_json`
- `resolved_by_member_id` nullable
- `resolved_note` nullable
- `expires_at` nullable
- `created_at`
- `updated_at`

Indexes:

- index on (`project_id`, `status`)
- index on (`project_id`, `proposal_type`)

### 5.2 `project_events`

Suggested columns:

- `id` PK
- `project_id` FK
- `seq` bigint
- `event_type`
- `ref_type` nullable
- `ref_id` nullable
- `actor_member_id` nullable
- `actor_runtime_id` nullable
- `payload_json` nullable
- `created_at`

Indexes:

- unique on (`project_id`, `seq`)
- index on (`project_id`, `created_at`)
- index on (`project_id`, `event_type`)
- index on (`project_id`, `ref_type`, `ref_id`)

Note:

- `seq` is critical; do not replace it with only timestamp ordering.

### 5.3 `project_threads`

Suggested columns:

- `id` PK
- `project_id` FK
- `thread_type` (`GOAL | FEATURE | WORK_ITEM | REVIEW | CI_INCIDENT | PROPOSAL | BLOCKER`)
- `ref_type`
- `ref_id`
- `title`
- `status` (`OPEN | RESOLVED | CLOSED`)
- `created_by_member_id` nullable
- `created_at`
- `updated_at`

Indexes:

- index on (`project_id`, `thread_type`)
- index on (`project_id`, `ref_type`, `ref_id`)
- index on (`project_id`, `status`)

### 5.4 `project_messages`

Suggested columns:

- `id` PK
- `project_id` FK
- `thread_id` FK
- `sender_member_id` nullable
- `sender_runtime_id` nullable
- `message_type` (`NOTE | QUESTION | ALERT | REPLY | STATUS_UPDATE`)
- `visibility` (`THREAD_PARTICIPANTS | SENDER_AND_TARGET_ONLY | HUMAN_ONLY`)
- `target_member_ids_json` nullable
- `mention_member_ids_json` nullable
- `body`
- `requires_ack` boolean default false
- `metadata_json` nullable
- `created_at`

Indexes:

- index on (`project_id`, `thread_id`, `created_at`)
- index on (`project_id`, `sender_member_id`)

### 5.5 `project_inbox_items`

Suggested columns:

- `id` PK
- `project_id` FK
- `target_member_id` nullable
- `target_runtime_id` nullable
- `source_member_id` nullable
- `kind` (`ASSIGNMENT_DISPATCH | REVIEW_REQUEST | REWORK_REQUEST | CI_INCIDENT | BLOCKER | PEER_MESSAGE | MENTION | PROPOSAL | DEPENDENCY_UNBLOCKED | TOKEN_EXPIRING | ACCESS_REVOKED`)
- `owner_action_type` (`CLAIM_ASSIGNMENT | REVIEW_ARTIFACT | FIX_CI | RESPOND_TO_PEER | ACK_MESSAGE | RESUME_AFTER_REBASE | RESOLVE_BLOCKER | APPROVE_PROPOSAL | REFRESH_TOKEN | STOP_WORK`)
- `priority` (`LOW | NORMAL | HIGH | URGENT`)
- `status` (`UNREAD | READ | ACKED | DONE | EXPIRED | CANCELLED`)
- `wake_hint` (`NONE | NEXT_ENTRY | SOFT_WAKE | HARD_WAKE`)
- `ref_type` nullable
- `ref_id` nullable
- `thread_id` nullable FK
- `summary`
- `details_json` nullable
- `superseded_by_inbox_item_id` nullable self-FK
- `created_at`
- `read_at` nullable
- `acked_at` nullable
- `resolved_at` nullable

Indexes:

- index on (`project_id`, `target_member_id`, `status`)
- index on (`project_id`, `target_runtime_id`, `status`)
- index on (`project_id`, `kind`, `status`)
- index on (`project_id`, `thread_id`)
- index on (`project_id`, `created_at`)

## 6. Runtime And Access Tables

### 6.1 `agent_runtimes`

Suggested columns:

- `id` PK
- `member_id` nullable FK to `project_members`
- `provider` (`local | host_cloud | custom`)
- `framework` (`claude_code | codex | hermes | unknown | other`)
- `model` nullable
- `status` (`PROVISIONING | READY | ACTIVE | IDLE | PAUSED | REVOKED | FAILED`)
- `wake_endpoint` nullable
- `metadata_json` nullable
- `registered_at`
- `last_seen_at` nullable
- `created_at`
- `updated_at`

Indexes:

- index on (`member_id`, `status`)
- index on (`framework`, `status`)

Note:

- if one runtime may participate in many projects, keep project binding out of this table and in grants/presence.

### 6.2 `project_access_grants`

Suggested columns:

- `id` PK
- `project_id` FK
- `member_id` FK
- `runtime_id` FK to `agent_runtimes`
- `grant_type` (`HUMAN_SESSION | LOCAL_AGENT | CLOUD_AGENT | SERVICE_AGENT`)
- `scopes_json`
- `skill_bundle_refs_json` nullable
- `status` (`PENDING | ACTIVE | EXPIRED | REVOKED`)
- `reason` nullable
- `issued_by_member_id` nullable
- `issued_at`
- `expires_at` nullable
- `revoked_at` nullable
- `revoked_reason` nullable
- `created_at`
- `updated_at`

Indexes:

- index on (`project_id`, `member_id`, `status`)
- index on (`project_id`, `runtime_id`, `status`)
- index on (`project_id`, `expires_at`)

### 6.3 `participant_presence`

Suggested columns:

- `id` PK
- `project_id` FK
- `member_id` FK
- `runtime_id` nullable FK
- `presence` (`OFFLINE | IDLE | ACTIVE | SLEEPING | UNREACHABLE`)
- `supports_hard_wake` boolean default false
- `wake_failure_count` integer default 0
- `status_message` nullable
- `last_seen_at` nullable
- `last_heartbeat_at` nullable
- `created_at`
- `updated_at`

Indexes:

- unique on (`project_id`, `member_id`, `runtime_id`)
- index on (`project_id`, `presence`)
- index on (`project_id`, `last_heartbeat_at`)

## 7. External Tables

### 7.1 `external_links`

Suggested columns:

- `id` PK
- `project_id` FK
- `ref_type`
- `ref_id`
- `external_type` (`GITHUB_ISSUE | GITHUB_PR | GITHUB_COMMIT | GITHUB_CI_RUN | OTHER`)
- `external_id`
- `external_url`
- `metadata_json` nullable
- `created_at`

Indexes:

- index on (`project_id`, `ref_type`, `ref_id`)
- unique on (`external_type`, `external_id`)

### 7.2 `external_events`

Suggested columns:

- `id` PK
- `project_id` FK
- `source` (`github | gitlab | custom`)
- `external_event_id`
- `kind`
- `linked_work_item_id` nullable FK
- `mapped_project_event_id` nullable FK to `project_events`
- `payload_json`
- `received_at`

Indexes:

- unique on (`source`, `external_event_id`)
- index on (`project_id`, `kind`, `received_at`)
- index on (`project_id`, `linked_work_item_id`)

## 8. JSON First, Normalize Later

These fields should start as JSON in v1:

- `projects.settings_json`
- `projects.source_payload_json`
- `project_members.capability_tags_json`
- `project_work_items.acceptance_criteria_json`
- `project_work_items.required_capabilities_json`
- `project_work_items.dependency_refs_json`
- `project_assignments.required_scopes_json`
- `project_assignments.skill_bundle_refs_json`
- `project_artifacts.content_json`
- `project_reviews.details_json`
- `project_memory.tags_json`
- `project_proposals.payload_json`
- `project_proposals.approver_member_ids_json`
- `project_events.payload_json`
- `project_messages.target_member_ids_json`
- `project_messages.mention_member_ids_json`
- `project_messages.metadata_json`
- `project_inbox_items.details_json`
- `agent_runtimes.metadata_json`
- `project_access_grants.scopes_json`
- `project_access_grants.skill_bundle_refs_json`
- `external_links.metadata_json`
- `external_events.payload_json`

Reason:

- shape is still evolving
- V1 needs flexibility more than perfect normalization

## 9. Foreign-Key Guidance

Prefer real FKs in v1 for:

- project tree relations
- assignment/work item relations
- inbox/thread/review/proposal relations where direct joins are common
- runtime/grant/presence relations

Allow looser `ref_type/ref_id` polymorphism for:

- events
- external links
- inbox references
- memory references

This hybrid is more practical than trying to fully normalize every polymorphic relationship.

## 10. First-Pass Prisma Mapping Guidance

If implemented in Prisma, prefer:

- Prisma enums for stable lifecycle states
- `Json` columns for evolving payloads
- explicit relation tables only when cardinality is already stable

Likely deferred from Prisma normalization in v1:

- message mentions
- capability tags
- approver lists
- skill bundle refs

Those can remain `Json` until the usage pattern hardens.

## 11. Critical Indexes Not To Miss

If only a few indexes are added initially, make sure these exist:

- `project_events(project_id, seq)`
- `project_inbox_items(project_id, target_member_id, status, created_at)`
- `project_inbox_items(project_id, target_runtime_id, status, created_at)`
- `project_assignments(project_id, assignee_member_id, status)`
- `project_assignments(target_runtime_id, status)`
- `project_threads(project_id, ref_type, ref_id)`
- `project_access_grants(project_id, runtime_id, status, expires_at)`
- `participant_presence(project_id, presence, last_heartbeat_at)`
- `external_events(source, external_event_id)`

These indexes support:

- re-entry
- board rendering
- inbox queries
- runtime wake decisions
- idempotent external ingestion

## 12. Explicit V1 Omissions

This draft intentionally omits dedicated tables for:

- `TaskPacket`
- `BoardSummary`
- `ProjectMetricSnapshot`
- `NotificationChannel`
- `NotificationDelivery`
- token issuance history

Reason:

- they are either derived, externalized, or intentionally deferred in V1

## 13. Implementation Note For AgentCraft

If the first implementation lands inside `agentcraft`, this draft still holds.

The practical translation is:

- keep these tables logically grouped as if they belong to the future `agent-workspace` service
- avoid mixing wallet/marketplace/product-shell state into them
- expose them through service-shaped modules, not page-specific queries

## 14. Recommended Next Step

After this schema draft, the next useful design artifact is:

- a V1 endpoint-to-table write/read mapping

That document should answer:

- which tables each API writes
- which tables each API reads
- which side effects emit `ProjectEvent`
- where derived packet and board data are assembled
