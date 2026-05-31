# agent-workspace

> An open project-collaboration control plane for human-agent and agent-agent work.

`agent-workspace` defines **what a remote, multi-agent project looks like and how runtimes coordinate inside it** — the context layers, the roles, the task lifecycle, inbox/message semantics, runtime entry and re-entry, the event bus, and the API/MCP interface agents use to coordinate.

It provides:

- a reusable project coordination model
- a role abstraction above individual skills
- project templates that package roles, SOP, defaults, and launch policy
- state-machine and permission rules
- inbox / messaging / re-entry contracts
- shared project-file storage contracts
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
- **Roles above skills**: a skill describes a reusable behavior or tool habit; a role describes who an actor is inside a project. Role definitions compose skills, capability bundles, initial prompts, runtime compatibility, launchability, polling behavior, and read/write scopes into an operational contract such as `LEAD_AGENT`, `WORKER_AGENT`, or `REVIEW_AGENT`.
- **Project templates above roles**: a template is the starting blueprint for a project. It composes shared and project-local roles, workflow SOP, project globals, shared-file folders, launch profiles, and default capabilities so a host can create a whole collaboration system rather than hand-picking agents one at a time.
- **Role contracts**: `OWNER / LEAD / PLANNER / WORKER / REVIEWER / PM / INTEGRATOR`, each with explicit read/write scopes.
- **Project shared files**: durable shared resources live under `projects/{projectId}/shared/{path}` and are accessed through scoped workspace APIs / MCP tools such as `project-file-list`, `project-file-search`, `project-file-read`, `project-file-write`, and `project-file-upload`.
- **Event bus**: a single monotonically-ordered stream per project. Agents subscribe with a cursor; external systems (GitHub CI, PR, merge) fold in through normalized `ExternalEvent`s.
- **Human-approval gates**: any action that needs a human goes through a uniform `Proposal` type, which is pushed to humans via an IM gateway (email, dingtalk, slack, matrix, telegram, …).
- **Concurrency on purpose**: a work item can be raced, paired, or run primary/backup — declared explicitly, not implied.
- **Full MCP tool surface**: every capability above is exposed as typed MCP tools with a permission matrix, so any agent runtime can plug in.

## Core abstractions

### Skills

Skills are the smallest reusable instruction units. They teach a runtime how to
perform a particular kind of work, use a tool surface, or follow a domain
workflow. A skill can be shared across many projects and many roles.

### Roles

Roles are one abstraction level above skills. A role turns a collection of
skills and capabilities into a project identity with a responsibility boundary:
what this actor is expected to do, what context it should load, which project
state it may read or write, which runtime features it needs, and when the host
may launch or wake it.

Shared role definitions live in `project-roles/`. Templates may reference them
with `role://<slug>` or override them with project-local role definitions when a
domain needs specialized behavior.

### Project templates

Project templates are one abstraction level above roles. A template describes a
complete project starting point: the role lineup, the workflow SOP those roles
should follow, required project globals, shared project-file folders, role launch
profiles, and default capability bundles.

This lets hosts create opinionated project types such as a default software
collaboration project or a HackerOne opportunity-research project. The template
captures both **who participates** and **how the work should flow**.

## Packaging direction

The preferred reuse mode is:

1. deploy `agent-workspace` as a standalone service
2. connect a database
3. register local or cloud runtimes
4. create and manage projects through API / MCP
5. optionally use thin client SDKs for runtime integration

`agent-workspace` is **not** intended to be only a helper library. The collaboration model depends on durable project state, scoped permissions, runtime identity, inbox/wake semantics, and auditability, so a backend service is the primary packaging target.

Host products like [AgentCraft](https://github.com/naliazheli/agentcraft) should be able to use `agent-workspace` by:

- creating projects through API, usually from a project template
- pulling project details and board state
- dispatching agents according to a lead agent's plan
- passing owner uploads and shared file operations through the workspace API
- receiving back inbox, review, event, and runtime status updates

The intended boundary is:

- `agent-workspace` owns the durable truth of project collaboration
- `agent-workspace` owns the durable project-file API and runtime authorization model
- host products own marketplace, billing, purchase, owner/member checks, and product-shell concerns

## Repo layout

```
agent-workspace/
├── capability-bundles/     # reusable tool / MCP / capability packages
├── docs/
│   ├── SPEC.md              # normative spec (domain model, roles, workflow, MCP signatures)
│   ├── architecture.md      # big-picture overview
│   ├── roles.md             # role contracts
│   └── mcp-tools.md         # full MCP tool catalog + permission matrix
├── project-roles/           # shared role library, above individual skills
├── project-templates/       # project blueprints: roles + workflow SOP + defaults
├── server/                  # (planned) reference backend service
├── sdk/                     # (planned) thin client SDKs
├── schemas/                 # (planned) JSON Schema / Prisma / Protobuf types
├── skills/                  # shared workspace skills
├── examples/                # (planned) end-to-end scenarios as runnable fixtures
├── CONTRIBUTING.md
├── LICENSE                  # MIT
└── README.md
```

Some folders are still draft or extraction targets, but the repository already
contains the shared role library, project templates, common workspace skills,
capability bundles, and schema drafts used by the host integration.

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
