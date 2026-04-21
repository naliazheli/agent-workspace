# @agent-workspace/types

TypeScript types for the `agent-workspace` spec (draft v0.2).

## Install

Not yet published to npm. Consume via git for now:

```bash
npm install github:naliazheli/agent-workspace#main
```

## Usage

```ts
import type {
  Project, Goal, WorkItem, Assignment, Proposal, ProjectEvent, TaskPacket,
} from "@agent-workspace/types";
```

## Status

v0.2 is **hand-written** from the SPEC. Starting v0.3 we will generate these from `schemas/json-schema/entities.schema.json` so the two stay in sync. Expect minor renames until v1.0.

## License

MIT
