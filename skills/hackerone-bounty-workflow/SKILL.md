# HackerOne Bounty Workflow

Use this skill when a project is created from a HackerOne bounty task, when an opportunity-research project is selecting HackerOne targets, or when the assignment references HackerOne program, scope, reward, testing, or report-template metadata.

## Operating Boundary

- Work only on the exact program and structured scope named in the assignment packet.
- Treat every worker assignment as independent unless the packet explicitly says `sameGoalContinuation` or `allowWorkerReuse`. On a new program or goal, ignore prior target conclusions in the conversation, re-read the current assignment packet and referenced project files, and write artifacts only under the current program's `evidence/<handle>/` and `coverage/<handle>/` paths. If fresh worker capacity is unavailable for an independent program, surface an owner capacity/settings blocker instead of reusing an idle worker from another target. Review/audit roles may reuse a same-role `IDLE` runtime for `IN_REVIEW` feedback because they must re-read the current handoff and evidence each time. Role-level parallel caps count running work, not idle history: `IDLE`, `READY`, `STOPPED`, and `ERROR` runtime sessions should not be treated as consuming `h1_max_parallel_*`, though they may still count toward broader project member/runtime limits.
- Treat every out-of-scope exclusion, platform-standard deviation, required header, account rule, and safe-testing note as a hard constraint.
- Do not perform destructive testing, denial-of-service, spam, credential attacks, social engineering, or tests against third-party services unless the assignment explicitly authorizes them.
- If the task packet is missing a required account, credential, test role, asset, or authorization detail, stop and report the blocker instead of guessing.
- If the assigned work item is still `DRAFT`, do intake, planning, review, or reporting work only. Do not run external validation until the owner or lead has approved the scoped test plan.
- For opportunity-discovery projects, do not fetch or test external targets until `hackerone_username` and `hackerone_api_token` project globals are configured. Runtimes should receive these as `PROJECT_GLOBAL_HACKERONE_USERNAME`, `PROJECT_GLOBAL_HACKERONE_API_TOKEN`, `HACKERONE_USERNAME`, and `HACKERONE_API_TOKEN`.
- Read project goals, work items, board state, project globals, project files, and memory through agent-workspace (`$AGENT_WORKSPACE_BASE_URL/v1/...`) with `Authorization: Bearer $AGENT_WORKSPACE_TOKEN`. Do not use host `$AIFACTORY_API_BASE_URL` for GET reads of those resources or for owner UI routes such as `/work-items/{id}/comments`. Host API is only for host-owned runtime helpers that explicitly require `Authorization: Bearer $AIFACTORY_RUNTIME_TOKEN`, including runtime helper writes, assignment/runtime health, goal status updates through `PATCH /projects/{projectId}/goals/{goalId}/runtime-update`, and `GET /projects/{projectId}/work-items/{workItemId}/runtime-comments` when you truly need work-item comments. Never call owner-only goal routes such as `PATCH /projects/{projectId}/goals/{goalId}` or guessed routes such as `/goals/{goalId}/status` with a runtime token. If a host GET read returns 401/403, stop retrying that host path and switch to the matching agent-workspace or runtime-helper path.

## Opportunity Discovery

For projects created from the `hackerone-opportunity-research` template:

1. Start from `https://hackerone.com/opportunities/all`, HackerOne API data available through the configured owner credentials, public program profiles, and prior project files. Prefer REST with HackerOne Basic Auth for program data, for example `https://api.hackerone.com/v1/hackers/programs?page%5Bsize%5D=100`; an unauthenticated REST 401 is expected and should not be treated as credential failure. The public HackerOne GraphQL endpoint at `https://hackerone.com/graphql` may expose opportunity search metadata, but can return generic errors for broad opportunity queries; use it as a fallback and query incrementally. Use short command-level network timeouts such as `curl --max-time 20` and retry narrowly; do not let one external request block the whole turn.
2. Treat `h1_opportunity_batch_limit` as a hard end-to-end analysis cap. It limits the number of new candidate programs whose detail pages, structured scopes, policy text, scoring records, and goal decisions may be fetched or evaluated in this assignment. You may fetch one compact listing page to find candidates, but after filtering already analyzed handles, choose at most the batch-limit candidates before fetching per-program details. Do not enrich or loop over dozens of programs just to rank a batch of five; record the remaining handles as not-yet-analyzed backlog and finish the bounded pass.
3. Before analyzing a candidate, read durable exclusion records from `analysed/`, `opportunities/analyzed.md`, `opportunities/analyzed.jsonl`, `programs/`, `coverage/`, and `submissions/`. Treat every HackerOne project/program URL in `analysed/` as already evaluated. Skip previously analyzed project URLs, handles, or assets unless a new update materially changes scope, reward, policy, or available test access.
4. Prefer targets that an agent can verify quickly and safely: web apps, public APIs, SDK/npm packages, OAuth/callback logic, popup or `postMessage` flows, webhooks, auth boundaries, multi-tenant object access, and dashboard/API inconsistencies.
5. Deprioritize mobile-only, hardware, thick-client, KYC/payment-heavy, real-funds, social-engineering, spam, DoS, destructive, vague, or strict-automation-ban targets unless the owner has provided exact authorization and setup.
6. Score each candidate 0-2 on scope clarity, setup speed, local repeatability, impact surface, prior-art usefulness, and safety. Prefer 8+ out of 12; defer below 6 unless the owner has special access or context.
7. Sort by strong autonomous-agent fit first, then recent scope/program updates, bounty eligibility, clear web/API/SDK/OAuth/multi-tenant assets, public docs/OpenAPI/npm/source-map hints, manageable account setup, and safe-harbor clarity.
8. Write every analyzed candidate to project shared files before creating new goals. Append a JSONL record to `analysed/project-addresses.jsonl` for every evaluated project URL, even when the decision is `SKIP`, `DEFER`, or `DUPLICATE`. Include date, normalized `projectUrl`, handle, source URL, decision, score when available, and a short reason. Before writing, merge against the existing file by normalized `projectUrl`; never append the same URL twice in one pass or duplicate a URL that is already recorded. Also write the richer analysis record to `opportunities/analyzed.jsonl` with date, handle, program URL, assets considered, score, decision, reasons, exclusions, duplicate/prior-art notes, and whether it was converted into a goal. For project files, prefer `. /opt/data/skills/agent-workspace/scripts/project-files.sh` plus `project-file-list`, `project-file-read`, and `project-file-write`; if calling HTTP directly, list via `GET /v1/projects/{projectId}/files?prefix=analysed/&recursive=true` and `GET /v1/projects/{projectId}/files?prefix=opportunities/&recursive=true`, not `/files/list`. Do not leave `analysed/project-addresses.jsonl` or `opportunities/analyzed.jsonl` only under `/opt/data/workspace`; local staging is acceptable only when synced to the same project shared paths after each candidate or small batch and verified before assignment completion.
9. For selected targets, create one project goal per program or tightly related asset group. Keep goal creation intentionally sparse: unless the owner configured a different limit, create at most 3-5 top target goals per discovery pass and record the rest as `CONSIDER` or `DEFER` in `opportunities/analyzed.jsonl`. The goal must include the HackerOne program URL, target handles/assets, scoring rationale, safe-test constraints, likely bug classes, required owner resources, and worker start context.

When scoring structured scopes from the HackerOne REST API, normalize `asset_type` case before classification. Common values are uppercase, such as `URL`, `API`, `WILDCARD`, `SOURCE_CODE`, `APPLE_STORE_APP_ID`, `GOOGLE_PLAY_APP_ID`, `DOWNLOADABLE_EXECUTABLES`, and `OTHER`; treat eligible `URL`, `API`, and `WILDCARD` assets as the strongest fit for local agents, while mobile-only, executable-only, hardware, payment/KYC-heavy, or broad `OTHER` scopes need additional justification before selection.

## Required Context

Read the assignment packet before acting. A complete HackerOne task project should provide:

- `source`: source task id, task title, task description, source link, reward, and acceptance criteria.
- `program`: program handle, program name, program URL, website, response times, and safe-harbor highlights.
- `scope`: asset identifier, asset type, submission eligibility, bounty eligibility, max severity, instruction, and scope update timestamp.
- `policy`: safe harbor, scope description, scope exclusions, platform-standard deviations, and last change dates.
- `testing`: required headers, account guidance, safe-testing rules, prohibited actions, and duplicate policy.
- `rewards`: scope reward range, reward table, currency, and bounty table timestamp.
- `reportTemplate`: the report fields expected by the imported HackerOne program.

## Workflow

1. Confirm the source task, program handle, asset identifier, asset type, submission eligibility, bounty eligibility, max severity, and reward range.
2. Read the scope instruction, scope description, exclusions, safe harbor flags, required headers, and report template before planning tests.
3. Build a minimal safe test plan. Name the hypothesis, target endpoints or flows, allowed account roles, expected evidence, and rollback or cleanup steps.
4. Execute only the smallest validation needed to prove or disprove the hypothesis.
5. Capture evidence with exact URLs, request/response excerpts, account roles, timestamps, screenshots or logs, and impact reasoning.
6. Map the result to HackerOne severity guidance and explain why it is in scope.
7. Prepare a report using the imported report fields. Include reproduction steps, impact, affected asset, tested account role, evidence, severity, and any residual uncertainty.

## Goal-Level Resources

Workers should not ask the owner to paste target credentials into chat. When a goal needs program-specific resources, create an owner-owned resource work item with `inputPacket.resourceRequest` and block dependent worker items on it. Do this before marking the current assignment complete when the missing resource is discovered during a handoff; do not merely list the blocker in prose.

Use stable lowercase keys scoped to the goal, for example:

- `h1_goal_<program_handle>_account_a_email`
- `h1_goal_<program_handle>_account_a_password`
- `h1_goal_<program_handle>_account_b_email`
- `h1_goal_<program_handle>_account_b_password`
- `h1_goal_<program_handle>_account_a_bearer`
- `h1_goal_<program_handle>_account_b_bearer`
- `h1_goal_<program_handle>_api_key`
- `h1_goal_<program_handle>_app_id`

Set `category` to `hackerone-goal`, `isSecret: true` for tokens/cookies/API keys/secrets, `required: true`, `createTaskOnMissing: true`, and `value: ""`. When the owner fills and completes the item, the host saves it as a project global and future runtimes receive it as `PROJECT_GLOBAL_H1_GOAL_<PROGRAM_HANDLE>_<RESOURCE_NAME>`.

Each `inputPacket.resourceRequest` maps to exactly one project global. If a test account requires an email, username, password, OTP seed, tenant id, or bearer cookie, create separate resource-request work items for each required key. Do not create only the email item and mention the password or second account only in `acceptanceCriteria`.

When creating follow-up worker, auditor, or integrator items, copy `resourceKeys` exactly from existing owner resource-request keys for the same goal. Do not invent aliases by adding or removing words such as `api`, `token`, `account`, or `password` after an owner request already exists; mismatched keys make the coordinator block on resources the owner cannot see.

Never create a HackerOne target worker, auditor, or integrator item without the target `goalId`. If a host helper rejects or cannot resolve the goal, stop and create an owner-visible coordination blocker naming the intended goal title and program URL instead of creating an unscoped item.

Use the agent-workspace work-item API with the runtime token:

```bash
source /opt/data/AGENT_WORKSPACE_RUNTIME.env
curl -sS --max-time 20 -X POST "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/work-items" \
  -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary @resource-request.json
```

The JSON body should use `title: "Resource Request: <resource label>"`, `workType: "INTEGRATION"`, `status: "READY"`, the current `goalId`, high `priority`, and `inputPacket.resourceRequest`. Do not leave the title as only `Resource Request:`; the visible title must include the label or key so the owner can distinguish items in the UI. The workspace service automatically assigns owner ownership for resource-request packets. If creation fails, add a visible runtime comment on the current work item naming the exact resource keys that are blocking follow-up validation.

If a resource is optional, mark it non-required or create the worker task with an explicit no-resource fallback. Do not dispatch validation that depends on missing resources.

Use `inputPacket.ownerAction` for owner-visible confirmations, approvals, or external manual steps that are not themselves secret values: CAPTCHA/OTP completion, "trial submitted", "safe side-effect probe approved", "report submission approved", or "skip optional API token". Keep these as normal owner-owned `INTEGRATION` work items with `status: "READY"`, the current `goalId`, high `priority`, and stable fields such as:

```json
{
  "ownerAction": {
    "key": "h1_goal_matomo_cloud_trial_submitted",
    "label": "Confirm Matomo Cloud trial was submitted",
    "type": "EXTERNAL_STEP",
    "category": "hackerone-goal",
    "required": true,
    "prompt": "Submit the trial form, confirm the email if required, then mark this action done."
  }
}
```

The workspace service automatically assigns owner ownership and deduplicates owner-action packets by scope, goal, and key. Do not put passwords, API keys, cookies, or tokens into `ownerAction`; create separate `resourceRequest` items for each resulting value. Dependent worker/auditor/integrator items should depend on the owner-action item when the confirmation itself is the blocker, and should list exact `resourceKeys` only when actual saved globals are required.

When reviewing an `IN_REVIEW` worker handoff, treat sections named "Resource Needs", "Blockers", "Needs Phase 2", "Next Steps", or equivalent prose that asks for test accounts, cookies, bearer tokens, API keys, app ids, owner approvals, private projects, tenant ids, or A/B accounts as actionable resource blockers unless the handoff explicitly says they are optional. Before setting that worker item to `ACCEPTED`, verify there is one open or accepted owner resource-request item for each stable key. If any required key is missing, create the resource-request item(s) or leave the worker item in `IN_REVIEW`/`NEEDS_REVISION`; do not mark it `ACCEPTED` just because Phase 1 passive recon files exist.

Before creating a new `SECURITY_AUDIT` work item for a goal, inspect the goal's existing `SECURITY_TEST` work items, assignment/runtime-state, runtime comments, and `reviews/<handle>/security-audit-*` shared files. A completed `SECURITY_AUDITOR` assignment on the original worker item or a verified audit artifact already counts as an audit for that goal; do not create a duplicate standalone audit item. Instead, create the next smallest worker revision, authenticated validation item, report/integration item, or owner todo required by the audit verdict.

Audit artifacts must not say resource blockers are resolved, recommend `ACCEPTED`, or call a missing stable key a minor gap while a required owner resource-request item is absent. If a listed stable resource key cannot be created, keep the reviewed item blocked/needs-revision and name only the missing key, not any secret value.

Auditors and validators must separate their own assignment status from the reviewed work item's status. If the audit artifact was written and verified, mark the auditor assignment `COMPLETED` even when the verdict recommends `NEEDS_REVISION`, `FAIL`, or an owner-resource blocker for the reviewed work item. Leave the auditor assignment open or mark it `FAILED` only when the audit could not be performed or the required audit artifact could not be written.

When splitting phases, keep unauthenticated/passive work separate from authenticated validation. Do not dispatch an item titled or scoped as "Authenticated Testing" until the required owner resource items are `ACCEPTED` or the corresponding globals are visible. If passive follow-up can proceed without credentials, create a distinct passive/deep-recon item that excludes credential-dependent steps.

For Phase 1 passive recon or source-analysis items, do not put likely future credentials in `inputPacket.resourceKeys`, `requiredResourceKeys`, `requiredGlobals`, or `requiredProjectGlobals`. Those fields are dispatch gates. Use `potentialResourceKeys` or `futureResourceKeys` for context, then create explicit owner `resourceRequest` items only when the next authenticated validation step truly needs saved values.

When reviewing source code, policy text, or documentation, keep tool output compact. Use `rg`, targeted `sed -n` ranges, structured parsers, and short excerpts around matched functions instead of dumping whole files, full policies, generated bundles, or large API responses into the model context.

Credential values must not appear in shell command text, scripts, comments, logs, session history, project files, or reports. Source runtime env files and use literal variable references like `"$HACKERONE_USERNAME:$HACKERONE_API_TOKEN"` or headers assembled by the shell at execution time; never type or paste the expanded value into a tool call.

Treat Phase 1 findings as candidates until independently validated. In follow-up work items and handoffs, avoid unverified severity labels such as "CRITICAL" except when a reproducible impact proof has already been captured and accepted. Prefer wording such as "candidate CORS issue requiring exploitability validation" or "possible information disclosure requiring scope and impact confirmation"; final severity belongs after auditor review. Do not call CORS, security-header, cache, redirect, version-banner, or public unauthenticated error behavior a vulnerability unless the evidence proves sensitive data exposure, authorization bypass, cross-tenant access, meaningful state change, or another concrete in-scope impact. Record routine header/CORS observations as reconnaissance notes or follow-up hypotheses, not report-ready findings.

Do not ask agents to solve CAPTCHAs, bypass anti-abuse barriers, evade bot detection, or perform account-creation automation against CAPTCHA/OTP flows. Do not submit synthetic telemetry, fake Sentry events, fake support tickets, fake error reports, webhook spam, email/SMS traffic, or other third-party side-effect probes unless the owner explicitly approves a safe, program-allowed validation path. Record CAPTCHA, OTP, KYC, payment, geo-blocking, bot-defense, and side-effect barriers as owner/resource blockers or scope limitations.

## Project Shared Files

Use project shared files for durable state:

- `opportunities/`: analyzed opportunity records and ranking decisions.
- `analysed/`: durable project/program URL exclusion records. `analysed/project-addresses.jsonl` is the canonical append-only list of evaluated HackerOne project URLs used to avoid re-analyzing the same program on later discovery passes.
- `programs/<handle>.md` or `.json`: program policy, scope, assets, exclusions, reward notes, and report template.
- `coverage/<handle>/`: tested areas, skipped areas, duplicate/prior-art reductions, and false-positive lessons.
- `evidence/<handle>/`: sanitized evidence only.
- `reports/<handle>/`: draft reports and review notes.
- `submissions/`: submitted report ids, titles, duplicate references, and closure lessons.

Verify shared outputs with `project-file-list` or `project-file-read` before claiming they exist. Keep raw tokens, cookies, bearer JWTs, private keys, verification codes, and unrelated user data out of shared files.

## Role Focus

- Scope Planner: produce the authorization checklist, blockers, hypotheses, target flows, and exact stop conditions.
- Security Tester: execute only approved, non-destructive validation steps and attach evidence to the work item.
- Finding Validator: review reproducibility, scope fit, false-positive risk, impact, and severity before report drafting.
- Report Writer: assemble the report draft from approved evidence and never submit externally without explicit owner instruction.

## Handoff Contract

Finish every assignment with:

- Scope status: in scope, blocked, or out of scope.
- Tests performed and tests intentionally skipped.
- Evidence collected, with artifact paths or links.
- Verification result: confirmed finding, no finding, inconclusive, or blocked.
- Report readiness: draft ready, needs more testing, or should not submit.
- Residual risk and reviewer instructions.

## Report Gate

Submit or recommend submission only when all are true:

- The behavior is in scope and not explicitly excluded.
- A triager can reproduce it from the report.
- A real security boundary or meaningful impact is shown.
- Duplicate/prior-art checks do not already cover the same asset, version, root cause, and impact.
- No customer data, destructive action, DoS, spam, social engineering, KYC/payment abuse, or real-money movement was required.
- The owner has approved report submission after reviewing the final draft.
