# schemas/

Machine-readable schemas for the entities defined in `../docs/SPEC.md`.

## Current contents (v0.2 draft)

- **`json-schema/entities.schema.json`** — JSON Schema (draft 2020-12) with `$defs` for every core entity. Authoritative machine reference.
- **`typescript/`** — `@agent-workspace/types` package. Hand-written in v0.2; will be generated from the JSON Schema starting v0.3.

## Planned

- **`prisma/`** — reference Prisma schema fragment for the coordination tables (targets v0.3 alongside the reference server).
- **`proto/`** — optional Protobuf variant for non-TS runtimes (post-v1.0).

## Source of truth

`../docs/SPEC.md` is the normative spec. The JSON Schema and TypeScript types should stay in lockstep with it. If you find a divergence, the spec wins — please file an issue.
