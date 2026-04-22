# agent-workspace — Open Source Packaging Strategy

> Status: Draft
> Purpose: define what `agent-workspace` is as an open-source project, how others should reuse it, and how `agentcraft` should integrate with it.

---

## 1. Positioning

`agent-workspace` is **an open project-collaboration control plane for human-agent and agent-agent work**.

It provides:

- a reusable project coordination model
- state-machine and permission rules
- inbox / messaging / re-entry contracts
- API and MCP contracts
- a reference backend
- a runtime integration surface
- authentication / authorization surfaces for runtimes and hosts

Chinese positioning:

`agent-workspace` 是一套可开源复用的 agent 项目协作控制平面，提供项目级对象模型、状态机、权限、消息 / inbox、runtime 接入协议以及参考实现。

This means:

- it is **not** only a set of design notes
- it is **not** primarily an SDK
- it should be reusable as a standalone service
- host products should be able to integrate with it through explicit APIs rather than embedding its storage model directly
- it does **not** need to own end-user pages or product UI

## 2. Primary Reuse Mode

The preferred reuse mode is:

### 2.1 Standalone service first

Other teams should be able to:

1. deploy `agent-workspace` as a service
2. connect a database
3. register runtimes / agents
4. create projects
5. dispatch agents into project work
6. consume board, inbox, review, proposal, and runtime-entry capabilities through API / MCP

This is the primary packaging strategy.

The service is expected to expose:

- project collaboration data APIs
- runtime entry / resume / heartbeat APIs
- access grant and token issuance / revocation APIs
- MCP tools for agent runtimes

It does **not** need to ship a complete end-user web app.

### 2.2 SDK second

SDKs are still useful, but only as **client SDKs** for the service.

They should help runtimes do things like:

- register a runtime
- resume a project
- heartbeat presence
- read inbox
- send messages
- submit artifacts / handoffs

SDKs should **not** try to embed the entire project-collaboration storage model in-process.

Reason:

- the system has too many persistent state objects
- correctness depends on shared state and coordination rules
- inbox, packet rebase, review, proposal, and event rules belong in a backend

## 3. Recommended Open-Source Shape

The repository should evolve toward three layers:

### 3.1 Normative specification

- `docs/SPEC.md`
- domain contracts
- MCP/API contracts
- runtime behavior expectations

### 3.2 Reference service

A standalone backend that implements:

- project objects
- runtime registration
- access grants
- inbox/message/thread coordination
- review/proposal lifecycle
- event normalization
- board read models

### 3.3 Client SDKs

Thin SDKs for:

- TypeScript
- Python

Potentially later:

- Go
- Rust

## 4. Minimal External Deliverable

To be truly reusable, the minimum viable open-source package should eventually include:

- a runnable backend service
- database migrations
- OpenAPI or equivalent HTTP contract
- MCP surface for agent runtimes
- Docker Compose
- example env file
- one local runtime example
- one cloud runtime example

Without those pieces, the repo is still useful as a spec, but not yet easy to adopt.

## 5. How `agentcraft` Should Use It

`agentcraft` should be treated as one host product that integrates with `agent-workspace`.

Recommended relationship:

- `agent-workspace` defines the reusable collaboration control plane
- `agentcraft` uses that control plane through implementation modules now
- later, `agentcraft` may call the standalone `agent-workspace` service through APIs
- `agentcraft` continues to own the product UI and user-facing pages

### 5.1 Target integration shape

In the long run, `agentcraft` should be able to:

1. create a project via `agent-workspace`
2. fetch project details, work items, inbox, and board state
3. assign or dispatch an agent according to the lead agent's plan
4. receive back project events, inbox changes, review results, and runtime status

In short:

`agentcraft` is a product host and UI shell; `agent-workspace` is the project-collaboration control plane behind it.

### 5.2 Current practical path

In the short term, implementation may still live inside `agentcraft`.

That is acceptable as long as:

- boundaries are preserved
- API contracts are explicit
- runtime entry / inbox / review / proposal semantics remain service-shaped

So the immediate path can be:

- design and validate in `agent-workspace`
- implement inside `agentcraft`
- later extract into a standalone `agent-workspace` service

### 5.3 Example integration contract

At minimum, a host product like `agentcraft` should be able to:

1. create a project through the `agent-workspace` API
2. read project detail, board state, member/runtimes, and inbox summaries
3. create or update assignments according to a lead agent's plan
4. dispatch a specific local or cloud runtime into project work
5. receive back review status, blocker status, CI incidents, and runtime progress

This keeps product-specific concerns in the host, while project coordination remains inside the control plane.

## 6. Service vs SDK Decision

### 6.1 It should be a service

Because the system includes:

- project-level storage
- state machines
- durable event history
- scoped permissions
- runtime/session identity
- inbox and wake logic
- review and proposal escalation

That combination makes it a backend system, not a helper library.

### 6.2 SDK should be intentionally thin

SDK responsibilities:

- auth + token handling
- request helpers
- typed client calls
- runtime convenience methods

Service responsibilities:

- truth of state
- persistence
- coordination logic
- wakeup / re-entry semantics
- audit

## 7. Repository Evolution Recommendation

The repo can grow from the current design-heavy state toward this shape:

```text
agent-workspace/
├── docs/
│   ├── SPEC.md
│   ├── architecture.md
│   ├── roles.md
│   ├── mcp-tools.md
│   └── design-notes/
├── server/                 # reference backend
├── sdk/
│   ├── typescript/
│   └── python/
├── schemas/
├── examples/
├── docker-compose.yml
└── README.md
```

This structure makes the reuse story obvious:

- read the spec
- run the service
- connect through SDK or direct API

## 8. Service Boundary Rule

When there is any ambiguity about where a capability belongs, use this rule:

- if it is the durable truth of project coordination, it belongs in `agent-workspace`
- if it is marketplace, billing, purchase, growth, or product-shell behavior, it belongs in the host product

Examples that belong in `agent-workspace`:

- project state
- assignments
- inbox/message/thread state
- review/proposal lifecycle
- runtime entry, resume, presence, and scoped access
- host authentication and scoped service authorization

Examples that belong outside:

- project board pages
- marketplace UI
- billing pages
- purchase flows
- app-wide navigation

- wallet balances
- coin purchase flows
- cloud agent marketplace pricing
- user growth funnels

## 9. Non-Goals For This Repo

`agent-workspace` should not become:

- a generic agent framework
- a model-provider wrapper
- a cloud-agent marketplace
- a pricing or wallet system
- a task marketplace product

Those may integrate with it, but they are not its core identity.

## 10. One-Sentence Summary

If someone asks what this repo is, the answer should be:

`agent-workspace` is an open project-collaboration control plane for human-agent and agent-agent work, packaged as a reusable service with API/MCP contracts and thin client SDKs.
