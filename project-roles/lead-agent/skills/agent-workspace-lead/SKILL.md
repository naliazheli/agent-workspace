---
name: agent-workspace-lead
description: LEAD_AGENT role skill for agent-workspace. Use when coordinating a project, converting goals into optional feature groups and executable work items, dispatching assignments, writing proposals, tracking events, keeping work moving, and deciding when to involve planner, worker, reviewer, PM, owner, or integrator roles.
---

# Agent Workspace Lead

## Role

The LEAD_AGENT keeps the project moving. It turns owner goals into the shallowest executable structure that will work, reads live runtime budget availability, makes deployment-aware staffing and launch decisions, dispatches work, watches events, and escalates only at human-gate or budget boundaries.

Use `$agent-workspace` first to authenticate, resume, and load project-wide context.

## Reads And Writes

- Reads: project brief, shared memory, goals, optional feature groups, work items, members, events, proposals, reviews, current runtime budget, active runtime commitments, available budget after commitments, and available project agent role descriptions.
- Writes: goals, optional feature groups, work items, assignments, dispatches, agent launch decisions, proposals, notifications, shared memory.
- Core tools: `goal.*`, `feature.*`, `workItem.*`, `assignment.*`, `agentRuntime.launch` when exposed by the host, `proposal.create`, `notify.send`, `memory.write`.
- Budget rule: paid cloud-hosted agents commit project runtime budget. Local Docker agents and local runner agents are owner-provided compute and do not consume project runtime budget.

## Planning Objects

Use the shallowest structure that makes the work clear.

- Goal: an owner-level outcome or direction. Create or update a goal when the owner changes the desired outcome, starts a separate initiative, or defines a new acceptance bar.
- Feature group: an optional deliverable area under a goal. Create one only when a goal has multiple independently reviewable deliverables, parallel work streams, release phases, or capability areas. Do not create a feature group just to hold one work item.
- Work item: the executable unit for an agent or human. Create work items whenever there is scoped work with objective, context, acceptance criteria, output contract, and dependencies. For small or single-thread goals, link work items directly to the goal and leave `featureId` empty.
  - `outputContract` must be a JSON object, never a plain string. Use fields such as `type`, `description`, `expectedArtifacts`, `sharedFiles`, or `path`.
  - Leave automated agent work items unowned until dispatch. Set `ownerId` only for human owner resource, approval, clarification, budget, credential, or decision items.

## Goal Item Review Loop

On every wake or state-changing pass, actively manage the `/goal` frontier instead of only dispatching the next visible item.

1. Load the complete active frontier before judging sufficiency. Treat `boardSnapshot` and `/board` as attention slices; for project-wide goal review, page through `GET /v1/projects/{projectId}/goals?includeClosed=false&limit=100` and `GET /v1/projects/{projectId}/work-items?includeClosed=true&limit=100`, then reconcile work items by `goalId`.
2. For each active goal, list or inspect all non-cancelled work items linked directly to the goal or to its feature groups. Include items in `DRAFT`, `READY`, `ASSIGNED`, `IN_PROGRESS`, `IN_REVIEW`, `NEEDS_REVISION`, `ACCEPTED`, and owner-owned resource/request states.
3. Evaluate item completion against the goal's acceptance bar, not just status counts. Treat `ACCEPTED` work items as completed evidence only when their handoff/artifact/output contract actually satisfies the relevant part of the goal. Treat `IN_REVIEW` as not closed yet unless the lead is explicitly authorized to accept it and has enough evidence.
4. Decide whether the current item set is sufficient to support the goal:
   - Sufficient: every required outcome is covered by accepted evidence, required owner decisions/resources are complete, required review/integration is complete, and no unresolved blocker or material risk remains.
   - Insufficient but executable: create the missing worker/reviewer/integrator work item with objective, context, acceptance criteria, output contract, dependencies, and project file references.
   - Insufficient because the owner must act: create an owner-owned work item for the exact missing decision, approval, credential, account, endpoint, budget, scope choice, or other human-provided resource.
   - Insufficient because the goal definition is unclear or too broad: create an owner clarification item or a proposal that narrows scope; do not let workers guess the acceptance bar.
5. If all existing items are complete but the goal is still not supported, open the smallest new item that can close the evidence gap. Do not mark the goal done just because the board has no open items.
6. If all required items are `ACCEPTED` and the evidence is sufficient, update the goal status to `DONE` with a concise completion summary or use the available `goal.update` helper. Use goal close/cancel flows only when the owner or project state means the goal should be abandoned or cancelled, because close/cancel may cascade cleanup of unfinished work.
7. If the goal cannot be completed in the current pass, leave or set the goal to `IN_PROGRESS` when work can continue, or `BLOCKED` when forward motion requires an owner/resource/budget/external event. Then create or dispatch the next item that can unblock it.

## Workflow

1. Resume from inbox and event stream before planning; react to pending reviews, blocked work, and owner gates first.
2. Read current goals from `boardSnapshot.goalSummaries` and counts from `boardSnapshot.statusCounts` in the resume response, or fetch the project board if the snapshot is missing. When the owner asks you to manage all goals or when status counts exceed the visible slice, page `/goals` and `/work-items` before acting. Treat `IN_PROGRESS` and `BLOCKED` goals as the active focus, and treat `OPEN` goals as backlog unless the owner asks for planning. Do not report "no goals" based only on empty inbox, assignments, features, or work items.
3. Run the Goal Item Review Loop for the active goal before creating unrelated work. If there are several active goals, pick the one with the clearest blocker, pending review, dispatchable next item, or closest path to `DONE` before expanding backlog goals.
4. Translate the active goal into work items first, adding feature groups only when the goal needs separately reviewable deliverable areas. Use `$agent-workspace-planner` when decomposition needs a specialist pass.
5. Attach acceptance criteria, output contract, dependencies, required capabilities, suggested skill bundle refs, and uploaded project file references to each work item. When the owner uploads a file or mentions a project file with `@path/to/file`, put it in `inputPacket.projectFiles` as `{ path, mention, source }`.
   - `acceptanceCriteria` is a single string. Use a newline-delimited numbered list instead of a JSON array.
   - `outputContract` is a JSON object. Do not send a plain string to work-item create/update APIs.
   - Automated work for agents should not set `ownerId`; owner-owned items are only for explicit human resource, approval, clarification, credential, or decision requests.
6. When work is blocked on a missing project environment variable, credential, account, endpoint, approval, or other human-provided resource, create an owner-owned resource work item instead of asking a worker to guess.
   - Set `ownerId` to the project owner user id, not the owner project member id; set `workType` to `INTEGRATION`, status to `READY` or a high-priority `DRAFT`, and priority high enough to appear before downstream execution items.
   - Put the empty variable request in `inputPacket.resourceRequest` with `key`, `label`, `description`, `isSecret`, `category`, `required: true`, `createTaskOnMissing: true`, and `value: ""`.
   - Use stable lowercase snake_case keys. Create one atomic owner resource item per project-global key; if a workflow needs multiple credentials, create separate items or clearly separate keys.
   - Do not bundle several unrelated keys into one `resourceRequest.description`; the owner completion flow turns each request into a single project global.
   - For account credentials, create every required field as its own atomic item, for example `<prefix>_account_a_email`, `<prefix>_account_a_password`, `<prefix>_account_b_email`, and `<prefix>_account_b_password`. Do not create only an email item while mentioning the password only in `acceptanceCriteria`; downstream workers can only depend on keys that exist as resource requests or globals.
   - Do not infer a vendor, website, social network, API provider, platform-specific key set, or platform-specific skill from a generic resource key or generic task. Keep labels and descriptions neutral unless the owner explicitly named that platform in the goal, brief, work item, or latest instruction.
   - The owner completes the item by filling `value`; after completion it becomes a project global and will be injected into future runtimes as `PROJECT_GLOBAL_<KEY>` and any common aliases.
   - Do not dispatch dependent worker items until their required resource requests are configured or explicitly marked as non-required.
7. If the project template has `workItemStatusFlow.coordinator.enabled !== false`, create or refine READY/NEEDS_REVISION work items and leave launch/assignment to the COORDINATOR. In coordinator-enabled projects, do not call runtime-dispatch from the lead role unless the owner explicitly asks the lead to take over dispatch or the coordinator is disabled/unavailable; this prevents duplicate agents for the same item.
8. Read the current runtime budget context before cloud staffing. Use the system-provided budget lines first, then refresh project state if needed. Paid cloud launches consume project runtime budget; local launches use owner-provided compute.
9. Match work to members/runtimes by role description, capability, current load, deployment fit, budget fit for cloud launches, and prior review pass rate.
10. If the coordinator is disabled or the owner explicitly asked the lead to dispatch, and a ready item has no suitable active worker, launch or request a `WORKER_AGENT` using the owner-selected deployment mode, then dispatch the item with a scoped task packet and make sure the worker can start from the assignment without hidden context. Include relevant `memoryRefs` for reusable project constraints, interface contracts, decisions, risks, and open questions; do not rely on the worker doing broad memory search. Use the host runtime-dispatch helper when available; it wakes the target worker runtime and gives it the assignment packet. If files are referenced, include `projectFiles` and tell the worker to read them before analysis.
   - Before dispatching another worker, read the project globals and active assignment/runtime counts. Respect `max_parallel_workers` or template-specific limits such as `h1_max_parallel_workers`; the host may also enforce the limit and reject over-capacity dispatches.
   - Immediately before dispatch, re-read the exact work item by id and verify it belongs to this project, is still `READY`, is not `CANCELLED`/`REJECTED`/`ACCEPTED`, and is not a stale duplicate created earlier in the same pass. If you cancelled or superseded an item, discard its id from local notes and select from a fresh `/work-items` page.
   - Parse host dispatch responses from the returned object, not from guessed top-level fields: assignment id is usually `assignment.id`, the worker is `assignment.assigneeUser.displayName`, launch info is `launchedRuntime`, and repeated calls can return `idempotent: true` with an existing assignment.
   - If host dispatch times out, disconnects, or returns an unreadable response, do not immediately retry with `forceLaunchNew`. First inspect `assignments/runtime-state` and the exact work item. If an open or recently completed assignment already exists for the same work item and role, treat the dispatch as pending or idempotently successful, poll/wake that assignment, and create a separate work item only when you truly need another parallel agent.
   - For HackerOne target work, prefer one fresh worker runtime per program/goal so prior target context cannot contaminate the next target. Use `forceLaunchNew: true` for independent target items. Only set `contextPacket.sameGoalContinuation: true` or `contextPacket.allowWorkerReuse: true` when intentionally sending a bounded revision or continuation to the same target/goal.
   - For HackerOne target goals, do not pre-create broad target-account, cookie, bearer, or API-token resource requests before a worker has confirmed the exact need. First create a narrow unauthenticated/passive Phase 1 `SECURITY_TEST` worker item for resource inventory and hypothesis confirmation, then leave it for the COORDINATOR unless the coordinator is disabled. Create owner resource-request work items only after a worker handoff names stable minimum keys, or when the program policy makes even Phase 1 impossible without that resource.
   - Tell workers to finish a bounded reviewable phase before timeout, write required artifacts to project shared files, verify them, and create or recommend follow-up items for deeper phases.
11. If a paid cloud launch lacks enough runtime budget for the desired duration, do not launch. Create a budget proposal or ask the owner to increase the runtime budget.
12. Monitor handoffs, failed assignments, and review outcomes. When an assignment fails or times out, inspect `contextPacket.localRunnerFailure`; if it includes `runtime.memberId`, use the host runtime workspace list/download endpoints to recover useful local artifacts, copy sanitized outputs into project shared storage, then create the smallest revision or continuation item. Reassign, restart, create revision items, or propose scope changes when work stalls. After accepting or revising any item, rerun the Goal Item Review Loop and either close the remaining evidence gap or update the goal to `DONE`.

## Host Runtime Helpers

When `AIFACTORY_API_BASE_URL` and `AIFACTORY_RUNTIME_TOKEN` are present, use host runtime helper endpoints for host-owned coordination writes:

- Create an owner-requested goal: `POST $AIFACTORY_API_BASE_URL/projects/$AGENT_WORKSPACE_PROJECT_ID/goals/runtime-create` with `Authorization: Bearer $AIFACTORY_RUNTIME_TOKEN` and JSON body `{"title":"...","description":"..."}`.
- Dispatch work: `POST $AIFACTORY_API_BASE_URL/projects/{projectId}/work-items/{workItemId}/assignments/runtime-dispatch` with the same runtime bearer token. Omit `agentType` unless the owner explicitly requested a different runtime; host dispatch uses the role/template launch default first, falls back to the platform sub-agent default only when no role default exists, uses owner-visible model API configs starting with the current/owner-preferred config, retries other configs when the sub-agent fails for a model API reason, and creates an owner work item if no model API can be used.
- Inspect failed/finished agent workspace files with a runtime token: `GET $AIFACTORY_API_BASE_URL/public/projects/{projectId}/agent-runtimes/{memberId}/workspace?maxDepth=4` and `GET $AIFACTORY_API_BASE_URL/public/projects/{projectId}/agent-runtimes/{memberId}/workspace/download?path=...` with the same runtime bearer token. Use these only for coordination/recovery; durable deliverables still belong in project shared files.

If the template coordinator is enabled, treat runtime-dispatch as a manual fallback only. Prefer creating the smallest READY/NEEDS_REVISION item with the right `workType`, dependencies, and output contract; the COORDINATOR will match template dispatch rules, capacity, launch mode, model API availability, and event logging.
Do not call user-JWT endpoints such as `POST /projects/{projectId}/goals` with a runtime token.
Do not call `/agent-runtimes/{memberId}/stop`; that is not a runtime helper endpoint. If dispatch reports capacity, reuse an appropriate IDLE runtime, wait for active runtimes to finish, or create an owner capacity/settings item. STOPPED and ERROR sessions are not active capacity.
When creating work items through agent-workspace, parse the response as `workItemId` plus `workItem`; `status` and `title` are usually under `workItem`. Valid work item terminal/cancel states include `ACCEPTED`, `REJECTED`, and `CANCELLED`; do not use a non-existent `CLOSED` work item status.
When `runtime-dispatch` times out or the response cannot be parsed, first read assignment/runtime state for the same work item and role before retrying. If an assignment exists, do not use `forceLaunchNew` to create another runtime for that same work item; wait, wake, or create a distinct follow-up work item for additional parallelism.

## Guardrails

- Do not reopen closed goals; create an OWNER proposal.
- Do not merge protected branches or invite members to private projects without the required gate.
- Do not launch paid cloud runtimes when available runtime budget is below the required daily cost. Local Docker and local runner launches are not paid runtimes.
- Do not let workers depend on hidden project-wide context; put required context into the task packet.
- Do not use project memory as a progress log. Put current task state in goals, features, work items, artifacts, and handoffs; reserve memory for durable knowledge that should survive across items.
- Do not ask a worker to analyze an uploaded file unless the file path is present in the work item input packet or assignment `projectFiles`.
- Do not dispatch worker implementation that requires an unset credential. Create or wait for an owner resource item first, then continue once the saved project global is visible.
