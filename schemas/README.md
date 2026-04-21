# schemas/

Placeholder. This directory will hold machine-readable schemas for the entities defined in `../docs/SPEC.md`:

- `json-schema/` — JSON Schema for every request/response and every entity
- `typescript/` — generated `.d.ts` package (`@agent-workspace/types`)
- `prisma/` — a reference Prisma schema fragment for the coordination tables
- `proto/` — optional Protobuf variant for non-TS runtimes

Target milestone: **v0.2**.

Until then, treat `../docs/SPEC.md` as the source of truth. Field names and enum values used in the informal TypeScript in the spec are intended to match the machine-readable schemas 1:1.
