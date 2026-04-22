# agent-workspace

> An open project-collaboration control plane for human-agent and agent-agent work.

`agent-workspace` defines **what a remote, multi-agent project looks like and how runtimes coordinate inside it** — the context layers, the roles, the task lifecycle, inbox/message semantics, runtime entry and re-entry, the event bus, and the API/MCP interface agents use to coordinate.

It provides:

- a reusable project coordination model
- state-machine and permission rules
- inbox / messaging / re-entry contracts
- API and MCP contracts
- a future reference backend
- a runtime integration surface

**Status: early draft.** Today the repo is still spec-heavy, but the intended packaging is **standalone service first, SDK second**. The reference implementation is being extracted out of [AgentCraft](https://github.com/naliazheli/agentcraft)'s `aifactory-server` project module and will land here in phases.

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

## Packaging direction

The preferred reuse mode is:

1. deploy `agent-workspace` as a standalone service
2. connect a database
3. register local or cloud runtimes
4. create and manage projects through API / MCP
5. optionally use thin client SDKs for runtime integration

`agent-workspace` is **not** intended to be only a helper library. The collaboration model depends on durable project state, scoped permissions, runtime identity, inbox/wake semantics, and auditability, so a backend service is the primary packaging target.

Host products like [AgentCraft](https://github.com/naliazheli/agentcraft) should be able to use `agent-workspace` by:

- creating projects through API
- pulling project details and board state
- dispatching agents according to a lead agent's plan
- receiving back inbox, review, event, and runtime status updates

The intended boundary is:

- `agent-workspace` owns the durable truth of project collaboration
- host products own marketplace, billing, purchase, and product-shell concerns

## Repo layout

```
agent-workspace/
├── docs/
│   ├── SPEC.md              # normative spec (domain model, roles, workflow, MCP signatures)
│   ├── architecture.md      # big-picture overview
│   ├── roles.md             # role contracts
│   └── mcp-tools.md         # full MCP tool catalog + permission matrix
├── server/                  # (planned) reference backend service
├── sdk/                     # (planned) thin client SDKs
├── schemas/                 # (planned) JSON Schema / Prisma / Protobuf types
├── examples/                # (planned) end-to-end scenarios as runnable fixtures
├── CONTRIBUTING.md
├── LICENSE                  # MIT
└── README.md
```

Folders under `server/`, `sdk/`, `schemas/`, and `examples/` are placeholders pending extraction from the reference implementation.

## Relation to other specs

- **Model Context Protocol (MCP)** — `agent-workspace` tools are served over MCP. MCP stays the transport; we define the project-layer schema on top.
- **Agent-to-Agent protocols / A2A / ACP** — those describe how two agents talk. `agent-workspace` describes what they are talking **about** in a project.
- **GitHub / Jira / Linear** — sources of ground truth for external code work. Bound through `ExternalLink` + normalized through `ExternalEvent`.

## Reference implementation

The reference implementation lives in [AgentCraft](https://github.com/naliazheli/agentcraft) under `aifactory-server/src/projects/` and the companion `agentcraft-im-gateway` service. Pieces will be extracted back here as they stabilize.

For current packaging intent, see:

- [Open Source Packaging Strategy](docs/design-notes/agent-workspace-open-source-packaging-strategy.md)

## Roadmap

- **v0.1 (now)** — SPEC.md published, types drafted, examples sketched.
- **v0.2** — JSON Schema + TypeScript types package in `schemas/`.
- **v0.3** — Minimal reference server extracted (Fastify/Hono + Prisma, MCP tools, event bus).
- **v0.4** — thin runtime SDKs + `im-gateway` reference extracted.
- **v1.0** — Stable schema, versioned MCP surface, compatibility test suite.

## License

MIT. See `LICENSE`.

## Status disclaimer

The spec is under active development and **will break** before v1.0. Pin to a commit if you build on it today.
