# HackerOne Bounty Workflow

Use this skill when a project is created from a HackerOne bounty task, when an opportunity-research project is selecting HackerOne targets, or when the assignment references HackerOne program, scope, reward, testing, or report-template metadata.

## Operating Boundary

- Work only on the exact program and structured scope named in the assignment packet.
- Treat every out-of-scope exclusion, platform-standard deviation, required header, account rule, and safe-testing note as a hard constraint.
- Do not perform destructive testing, denial-of-service, spam, credential attacks, social engineering, or tests against third-party services unless the assignment explicitly authorizes them.
- If the task packet is missing a required account, credential, test role, asset, or authorization detail, stop and report the blocker instead of guessing.
- If the assigned work item is still `DRAFT`, do intake, planning, review, or reporting work only. Do not run external validation until the owner or lead has approved the scoped test plan.
- For opportunity-discovery projects, do not fetch or test external targets until `hackerone_username` and `hackerone_api_token` project globals are configured. Runtimes should receive these as `PROJECT_GLOBAL_HACKERONE_USERNAME`, `PROJECT_GLOBAL_HACKERONE_API_TOKEN`, `HACKERONE_USERNAME`, and `HACKERONE_API_TOKEN`.

## Opportunity Discovery

For projects created from the `hackerone-opportunity-research` template:

1. Start from `https://hackerone.com/opportunities/all`, HackerOne API data available through the configured owner credentials, public program profiles, and prior project files.
2. Before analyzing a candidate, read durable exclusion records from `opportunities/analyzed.md`, `opportunities/analyzed.jsonl`, `programs/`, `coverage/`, and `submissions/`. Skip previously analyzed handles/assets unless a new update materially changes scope, reward, policy, or available test access.
3. Prefer targets that an agent can verify quickly and safely: web apps, public APIs, SDK/npm packages, OAuth/callback logic, popup or `postMessage` flows, webhooks, auth boundaries, multi-tenant object access, and dashboard/API inconsistencies.
4. Deprioritize mobile-only, hardware, thick-client, KYC/payment-heavy, real-funds, social-engineering, spam, DoS, destructive, vague, or strict-automation-ban targets unless the owner has provided exact authorization and setup.
5. Score each candidate 0-2 on scope clarity, setup speed, local repeatability, impact surface, prior-art usefulness, and safety. Prefer 8+ out of 12; defer below 6 unless the owner has special access or context.
6. Sort by strong autonomous-agent fit first, then recent scope/program updates, bounty eligibility, clear web/API/SDK/OAuth/multi-tenant assets, public docs/OpenAPI/npm/source-map hints, manageable account setup, and safe-harbor clarity.
7. Write every analyzed candidate to project shared files before creating new goals. Include date, handle, program URL, assets considered, score, decision, reasons, exclusions, duplicate/prior-art notes, and whether it was converted into a goal.
8. For selected targets, create one project goal per program or tightly related asset group. The goal must include the HackerOne program URL, target handles/assets, scoring rationale, safe-test constraints, likely bug classes, required owner resources, and worker start context.

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

Workers should not ask the owner to paste target credentials into chat. When a goal needs program-specific resources, create an owner-owned resource work item with `inputPacket.resourceRequest` and block dependent worker items on it.

Use stable lowercase keys scoped to the goal, for example:

- `h1_goal_<program_handle>_account_a_email`
- `h1_goal_<program_handle>_account_b_email`
- `h1_goal_<program_handle>_account_a_bearer`
- `h1_goal_<program_handle>_account_b_bearer`
- `h1_goal_<program_handle>_api_key`
- `h1_goal_<program_handle>_app_id`

Set `category` to `hackerone-goal`, `isSecret: true` for tokens/cookies/API keys/secrets, `required: true`, `createTaskOnMissing: true`, and `value: ""`. When the owner fills and completes the item, the host saves it as a project global and future runtimes receive it as `PROJECT_GLOBAL_H1_GOAL_<PROGRAM_HANDLE>_<RESOURCE_NAME>`.

If a resource is optional, mark it non-required or create the worker task with an explicit no-resource fallback. Do not dispatch validation that depends on missing resources.

## Project Shared Files

Use project shared files for durable state:

- `opportunities/`: analyzed opportunity records and ranking decisions.
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
