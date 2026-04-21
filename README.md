# agent-workspace

> A spec for how multiple agents share context and split work on a remote project.

`agent-workspace` defines **what a remote, multi-agent project looks like** — the context layers, the roles, the task lifecycle, the event bus, and the interface (MCP) that agents use to coordinate. It is the missing "project layer" on top of tool-calling and agent-to-agent protocols.

**Status: early draft.** Specification only. The reference implementation is being extracted out of [AgentCraft](https://github.com/naliazheli/agentcraft)'s `aifactory-server` project module and will land here in phases.

## What problem it solves

Today's multi-agent stacks are good at:

- tool integration
- orchestration of one agent at a time
- agent-to-agent messaging

They are not good at **complex work that needs shared context, role assignment, task decomposition, progress tracking, and coordinated execution across many agents and humans over time**. `agent-workspace` adds exactly that layer.

## Core ideas

- **Four-layer context**: `Project Brief` → `Shared Memory` → `Task Packet` (per assignment) → `Handoff Package` (per delivery). Agents never share one giant conversation.
- **Role contracts**: `OWNER / LEAD / PLANNER / WORKER / REVIEWER / PM / INTEGRATOR`, each with explicit read/write scopes.
- **Event bus**: a single monotonically-ordered stream per project. Agents subscribe with a cursor; external systems (GitHub CI, PR, merge) fold in through normalized `ExternalEvent`s.
- **Human-approval gates**: any action that needs a human goes through a uniform `Proposal` type, which is pushed to humans via an IM gateway (email, dingtalk, slack, matrix, telegram, …).
- **Concurrency on purpose**: a work item can be raced, paired, or run primary/backup — declared explicitly, not implied.
- **Full MCP tool surface**: every capability above is exposed as typed MCP tools with a permission matrix, so any agent runtime can plug in.

## Repo layout

```
agent-workspace/
├── docs/
│   ├── SPEC.md              # normative spec (domain model, roles, workflow, MCP signatures)
│   ├── architecture.md      # big-picture overview
│   ├── roles.md             # role contracts
│   └── mcp-tools.md         # full MCP tool catalog + permission matrix
├── schemas/                 # (planned) JSON Schema / Prisma / Protobuf types
├── examples/                # (planned) end-to-end scenarios as runnable fixtures
├── CONTRIBUTING.md
├── LICENSE                  # MIT
└── README.md
```

Folders under `schemas/` and `examples/` are placeholders pending extraction from the reference implementation.

## Relation to other specs

- **Model Context Protocol (MCP)** — `agent-workspace` tools are served over MCP. MCP stays the transport; we define the project-layer schema on top.
- **Agent-to-Agent protocols / A2A / ACP** — those describe how two agents talk. `agent-workspace` describes what they are talking **about** in a project.
- **GitHub / Jira / Linear** — sources of ground truth for external code work. Bound through `ExternalLink` + normalized through `ExternalEvent`.

## Reference implementation

The reference implementation lives in [AgentCraft](https://github.com/naliazheli/agentcraft) under `aifactory-server/src/projects/` and the companion `agentcraft-im-gateway` service. Pieces will be extracted back here as they stabilize.

## Roadmap

- **v0.1 (now)** — SPEC.md published, types drafted, examples sketched.
- **v0.2** — JSON Schema + TypeScript types package in `schemas/`.
- **v0.3** — Minimal reference server extracted (Fastify/Hono + Prisma, MCP tools, event bus).
- **v0.4** — `im-gateway` reference extracted.
- **v1.0** — Stable schema, versioned MCP surface, compatibility test suite.

## License

MIT. See `LICENSE`.

## Status disclaimer

The spec is under active development and **will break** before v1.0. Pin to a commit if you build on it today.
