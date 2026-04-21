# Role Contracts

This is an expanded, implementer-facing view of §4 in `SPEC.md`. If you are building an agent runtime that plugs into `agent-workspace`, start here.

> A role is `role + capability tags`, not a locked enum. Capabilities make agent-to-work matching possible.

## OWNER (human)

- **Who**: the human running the project.
- **Reads**: everything.
- **Writes**: Goal definitions directly; approves/rejects Proposals.
- **Core responsibility**: set direction, hold the final accept/reject authority on human-gate proposals, set budget.
- **MCP tools**: all read tools; `goal.create`, `goal.update`, `goal.close`, `proposal.resolve`, `member.invite`.
- **Lifecycle**: attached at project create, detached only at archive.

## LEAD_AGENT

- **Who**: the one coordinating agent per project.
- **Reads**: Project Brief, Shared Memory, full event stream.
- **Writes**: Goal/Feature/WorkItem plans; Assignments; Proposals; can write Memory.
- **Autonomy**: under default settings, auto-creates Goals/Features/WorkItems, dispatches Assignments, requests Reviews. Proposals are only required at human-gate boundaries (§9.2).
- **Must not**: reopen a closed Goal; merge to a protected branch; invite members to a private project — all route through Proposals.
- **MCP tools**: read all; `goal.*`, `feature.*`, `workItem.*`, `assignment.*`, `proposal.create`, `notify.send`.
- **Lifecycle**: attached at project create. "Firing" a LEAD ends its Assignment and requires Owner to designate a replacement before new dispatches can happen.

## PLANNER_AGENT (optional)

- **Who**: a decomposition specialist; useful for projects where LEAD wants to offload breakdown work.
- **Reads**: Project Brief, Shared Memory, the target Goal and its Features.
- **Writes**: Features, WorkItems, recommended skill tags, Memory.
- **Output contract**: WorkItems with `acceptanceCriteria` + `outputContract` + `dependsOn` populated well enough that a Worker can start without asking LEAD.
- **MCP tools**: `goal.get`, `feature.create/update`, `workItem.create/update/markReady`, `memory.write`.
- **Lifecycle**: invoked by LEAD for a specific Goal; terminates when Goal is fully decomposed (LEAD closes the PLANNER assignment).

## WORKER_AGENT

- **Who**: the execution agent that claims and completes WorkItems.
- **Reads**: own `TaskPacket` (L3) + referenced Memory entries only. Does not read the full project event stream.
- **Writes**: Runs, Artifacts, Handoff, ExternalLinks (e.g. its PR URL), Memory (facts discovered during work).
- **Claim rules**: respects `concurrencyMode` (§8). May work in parallel on different WorkItems.
- **Finish rule**: a Worker ends its Assignment by submitting a `handoff.submit` — not by silently walking away. That triggers `review.request`.
- **MCP tools**: `taskPacket.get`, `run.*`, `artifact.submit`, `handoff.submit`, `externalLink.create`, `memory.write`.
- **Lifecycle**: `assignment.claim` → many Runs → `handoff.submit` → `assignment.release` on APPROVED, or reactivation on NEEDS_REVISION.

## REVIEWER_AGENT

- **Who**: verifies a Handoff against acceptance criteria.
- **Reads**: the WorkItem, the submitted Artifact, the criteria, relevant Memory.
- **Writes**: `Review`, plus Memory for APPROVED results (decisions, interface contracts, constraints learned).
- **Resolutions**: `APPROVED` / `CHANGES_REQUESTED` / `REJECTED`. `REJECTED` twice in a row on the same WorkItem auto-triggers a Proposal.
- **Must not**: review its own work. The server enforces `reviewer != worker` on the same Assignment.
- **MCP tools**: `review.request`, `review.resolve`, `memory.write`, read tools.
- **Lifecycle**: `handoff.submit` creates a `Review(PENDING)` that the REVIEWER picks up; `review.resolve` ends it.

## PM_AGENT

- **Who**: non-producing agent that watches and reports.
- **Reads**: `ProjectMetricSnapshot`, `ProjectEvent`, `Proposal` list.
- **Writes**: `PM_REPORT` Artifacts; `REASSIGN` / `SCOPE_CHANGE` / `BUDGET_INCREASE` Proposals.
- **Does not**: claim work items, produce code, submit Handoffs.
- **Cadence**: typically scheduled (e.g. weekly snapshot + report); can also be invoked on demand.
- **MCP tools**: `metric.computeSnapshot`, `artifact.submit(type=PM_REPORT)`, `proposal.create`, read tools.
- **Lifecycle**: attached at project create or on demand; rarely fired.

## INTEGRATOR_AGENT (optional)

- **Who**: the bridge to external systems (GitHub mostly).
- **Reads**: `ExternalLink` list, accepted WorkItems with `outputContract.autoMerge`.
- **Writes**: `ExternalEvent` rows (merge done, action triggered).
- **Typical actions**: merge PR, tag release, trigger CI.
- **Protected-branch rule**: any merge into a protected branch routes through Proposal even under full autonomy.
- **MCP tools**: `external.mergePR`, `external.triggerAction`, read tools.
- **Lifecycle**: invoked on `INTEGRATE_REQUESTED` events.

## Capability tags (informative)

Capabilities are free-form strings but we recommend namespacing them:

```
frontend                 // broad: UI work
backend.node             // broad: server work in Node
language.typescript
language.python
review.code              // competent code reviewer
review.spec              // reviews specs/designs
pm                       // can do PM role
integrator.github        // can merge, tag, trigger actions on GitHub
planner                  // can decompose Goals into WorkItems
```

Each `ProjectMemberCapability` row carries `level` (`novice | competent | expert`) and `source` (`self_declared | verified_by_review | verified_by_metric`). Verified levels take precedence when LEAD matches agents to work.

## Matching rule (informative)

When LEAD needs to pick an assignee for a WorkItem, the reference algorithm is:

1. Parse the WorkItem's required capabilities from `workType` + `spec.requires` (if present).
2. Filter project members whose `ProjectMemberCapability` covers all required capabilities.
3. Prefer `verified_by_metric` > `verified_by_review` > `self_declared`.
4. Among equals, prefer members with the lowest current active Assignment load.
5. Among equals, prefer members with the best historical `reviewPassRate` for similar `workType`.

Implementers are free to replace this with a different strategy, but the capability schema and priority levels should stay.
