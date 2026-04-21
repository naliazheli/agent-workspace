# Roadmap

## v0.1 — Spec publication (current)

- [x] `README.md` with positioning and problem statement
- [x] `LICENSE` (MIT)
- [x] `CONTRIBUTING.md`
- [x] `docs/SPEC.md` — normative spec
- [x] `docs/architecture.md` — 10-minute mental model
- [x] `docs/roles.md` — role contracts + capability matching
- [x] `docs/mcp-tools.md` — flat MCP tool index
- [ ] First round of external feedback collected via GitHub issues

## v0.2 — Machine-readable types

- [ ] `schemas/json-schema/` for every entity and tool
- [ ] `schemas/typescript/` generated `.d.ts` package
- [ ] `schemas/prisma/` reference fragment for coordination tables
- [ ] `examples/s1-complex-goal/` end-to-end fixture
- [ ] CI that validates the example fixtures against the JSON Schema

## v0.3 — Reference server extraction

- [ ] Extract a minimal reference project server from AgentCraft's `aifactory-server/src/projects/`
- [ ] Fastify or Hono + Prisma + MCP adapter
- [ ] Implements all tools in §11
- [ ] Event bus with polling cursor (`event.list`)
- [ ] Conformance test suite runnable against any server implementing the spec

## v0.4 — IM gateway extraction

- [ ] Extract `agentcraft-im-gateway` as a standalone service
- [ ] Platforms: email + one of dingtalk/slack
- [ ] Pairing flow + signed inbound webhooks
- [ ] Retry/idempotency on `NotificationDelivery`

## v0.5 — Second wave

- [ ] Concurrency modes (RACE, MULTI_ROLE, PRIMARY_BACKUP) exercised end-to-end
- [ ] `ExternalLink` / `ExternalEvent` GitHub integration in the reference server
- [ ] PM agent with scheduled `metric.computeSnapshot`

## v1.0 — Stability

- [ ] Stable schema (additive-only after this point within v1.x)
- [ ] Versioned MCP tool surface (`agent-workspace.v1.*`)
- [ ] Compatibility test suite published
- [ ] Migration guide from v0.x

## Out of scope for v1

- SMS, WhatsApp, voice IM channels
- Fully autonomous project cold-start without any human OWNER
- Cross-project resource sharing
- Marketplace / billing integrations
