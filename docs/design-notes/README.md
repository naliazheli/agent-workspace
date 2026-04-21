# Design Notes

Historical design documents that led to the current `SPEC.md`. They are kept here for traceability and context, but **`SPEC.md` is the source of truth**. If there is a disagreement between these notes and `SPEC.md`, the spec wins.

## Contents

- **`project-platform-v1-design.md`** — original single-tenant project platform design (v1). Defines the core execution skeleton (`Project / Goal / Feature / WorkItem / Assignment / Run / Artifact / Review / Memory`). v2 is a non-breaking increment on top of this.
- **`project-platform-v2-collab-design.md`** — multi-agent collaboration addendum. Introduces context layering, role contracts, MCP tool surface, concurrent assignments, the `ProjectEvent` bus, `ProjectProposal`, and the IM gateway. This document was the direct source material for `../SPEC.md`.

## Product references in these notes

The notes mention `AgentCraft` and `aifactory-server` as the reference implementation. In the neutralized spec those references are abstracted away; here they are kept verbatim for faithful history.
