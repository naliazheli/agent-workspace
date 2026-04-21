# MCP Tool Catalog

Companion to `SPEC.md` §11. Flat index for quick scanning. Authoritative signatures live in `SPEC.md`.

## Grouping

| Group | Primary callers | Count |
|---|---|---|
| Read | All roles | 12 |
| Planning | LEAD, PLANNER | 10 |
| Dispatch | LEAD | 6 |
| Execution | WORKER | 7 |
| Review | REVIEWER | 3 |
| PM | PM_AGENT | 2 (+ shared `artifact.submit`) |
| Integrator | INTEGRATOR | 2 |
| Human gate & notify | Cross-role | 4 |

## Quick index

### Read
- `project.get`
- `project.listMembers`
- `goal.list`
- `goal.get`
- `feature.list`
- `workItem.list`
- `workItem.get`
- `memory.search`
- `taskPacket.get`
- `event.list`
- `metric.getSnapshot`
- `externalLink.list`

### Planning
- `goal.create` — auto | proposal (first goal by agent)
- `goal.update` — auto (safe fields) | proposal (semantic)
- `goal.close` — auto | proposal (cascade threshold)
- `goal.reopen` — proposal only, OWNER approver
- `feature.create`, `feature.update`, `feature.close`
- `workItem.create`, `workItem.update`, `workItem.cancel`, `workItem.markReady`

### Dispatch
- `assignment.create`
- `assignment.pause`
- `assignment.release`
- `assignment.restart`
- `member.invite` — auto (public) | proposal (private)
- `member.remove`

### Execution
- `assignment.claim` — respects `concurrencyMode`
- `run.start`
- `run.log`
- `run.finish`
- `artifact.submit`
- `handoff.submit` — side-effect: triggers `review.request`
- `externalLink.create`

### Review
- `review.request`
- `review.resolve` — side-effects: Memory extraction on APPROVED; Proposal on 2× REJECTED
- `memory.write`

### PM
- `metric.computeSnapshot`
- `proposal.create` (types: REASSIGN / SCOPE_CHANGE / BUDGET_INCREASE)
- `artifact.submit(artifactType=PM_REPORT)` — shared tool

### Integrator
- `external.mergePR` — auto | proposal (protected branch)
- `external.triggerAction`

### Human gate & notify
- `proposal.create`
- `proposal.list`
- `proposal.resolve`
- `notify.send` — rate-limited per project

## Cross-cutting design notes

- **Idempotency.** Every write tool should accept an optional `clientRequestId`. Reference impl dedups on `(toolName, clientRequestId, callerUserId)` within a 24h window.
- **Cursors.** `event.list` uses `seq` (monotonic per project). Always return `lastSeq` so callers advance without guessing.
- **Partial failure.** Tools with cascading side-effects (`goal.close`, `handoff.submit`, `review.resolve`) must be transactional on the primary write; side-effects that touch external systems may be queued and retried via the event bus.
- **Rate limiting.** `notify.send` is limited per project per hour (reference default: 60). Proposal-driven notifications are exempt.
- **Auth.** Every call carries the caller's `userId` and the target `projectId`. Membership is checked before role-based permission; both must pass.
- **Discovery.** A reference MCP server exposes these tools under a stable namespace (`agent-workspace.v0.*`). Tool metadata includes role requirements so a client can auto-hide tools the caller cannot use.

## Versioning policy

- Tool names are stable within a major version (`v0`, `v1`, …).
- Backwards-compatible additions (new optional input fields, new response fields) bump the minor spec version.
- Renames or removals require a new major version and a deprecation window of at least one minor release.
