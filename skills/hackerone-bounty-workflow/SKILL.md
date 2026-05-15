# HackerOne Bounty Workflow

Use this skill when a project is created from a HackerOne bounty task or when the assignment references HackerOne program, scope, reward, testing, or report-template metadata.

## Operating Boundary

- Work only on the exact program and structured scope named in the assignment packet.
- Treat every out-of-scope exclusion, platform-standard deviation, required header, account rule, and safe-testing note as a hard constraint.
- Do not perform destructive testing, denial-of-service, spam, credential attacks, social engineering, or tests against third-party services unless the assignment explicitly authorizes them.
- If the task packet is missing a required account, credential, test role, asset, or authorization detail, stop and report the blocker instead of guessing.
- If the assigned work item is still `DRAFT`, do intake, planning, review, or reporting work only. Do not run external validation until the owner or lead has approved the scoped test plan.

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
