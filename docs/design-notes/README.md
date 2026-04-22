# Design Notes

Historical design documents that led to the current `SPEC.md`. They are kept here for traceability and context, but **`SPEC.md` is the source of truth**. If there is a disagreement between these notes and `SPEC.md`, the spec wins.

## Contents

- **`project-platform-v1-design.md`** — original single-tenant project platform design (v1). Defines the core execution skeleton (`Project / Goal / Feature / WorkItem / Assignment / Run / Artifact / Review / Memory`). v2 is a non-breaking increment on top of this.
- **`project-platform-v2-collab-design.md`** — multi-agent collaboration addendum. Introduces context layering, role contracts, MCP tool surface, concurrent assignments, the `ProjectEvent` bus, `ProjectProposal`, and the IM gateway. This document was the direct source material for `../SPEC.md`.
- **`project-platform-v2-agent-behavior-catalog.md`** — behavioral companion to v2. Enumerates agent entry, re-entry, inbox/message, permission, cloud-worker dispatch, and test-driving behavior scenarios before schema lock-in.
- **`project-platform-v2-agent-inbox-and-messaging.md`** — project-local coordination design. Defines inbox items, project messages, wake levels, re-entry order, cloud-worker dispatch signaling, and the coordination rules between agents and humans.
- **`project-platform-v2-agentcraft-implementation-mapping.md`** — implementation bridge from `agent-workspace` into `agentcraft`. Explains the single-database recommendation, module/API/UI mapping, rollout slices, and the object-boundary matrix for `ProjectEvent` / `ProjectInboxItem` / `ProjectMessage` / `ProjectThread` / `ProjectReview` / `ProjectProposal`.
- **`agent-workspace-open-source-packaging-strategy.md`** — repo-level positioning and packaging strategy. Defines `agent-workspace` as a standalone project-collaboration control plane service, explains why service-first beats SDK-first, and describes how host products such as `agentcraft` should integrate with it.
- **`agent-workspace-minimal-service-api.md`** — first-pass API boundary draft for the standalone service. Defines host-product APIs, runtime APIs, auth/access surfaces, MCP parity, and the rule that board UI stays outside the service.
- **`agent-workspace-auth-and-authorization-model.md`** — trust and security boundary draft for the standalone service. Defines `HostClient` / `ProjectRuntime` / `ExternalIntegrationClient`, grant/token lifecycle, delegation rules, revocation behavior, and first-pass scope posture.
- **`agent-workspace-v1-schema-shortlist.md`** — minimum durable data-model shortlist for the standalone service. Separates must-store collaboration truth from projections, derived objects, and explicitly deferred tables.
- **`agent-workspace-v1-relational-schema-draft.md`** — concrete first-pass relational schema draft. Proposes table names, key columns, enum directions, JSON boundaries, FK guidance, and critical indexes for a real V1 implementation.

## Product references in these notes

The notes mention `AgentCraft` and `aifactory-server` as the reference implementation. In the neutralized spec those references are abstracted away; here they are kept verbatim for faithful history.
