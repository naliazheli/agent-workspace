# project-templates/

A **project template** is one level of abstraction above a single agent role: it
describes a complete starting point for a new project.

A template bundles:

- **`roles`** — the ordered set of roles the project ships with. Each entry
  may reference a role definition from the shared role library at
  `../project-roles/<slug>/role.json` via `role://<slug>`, or define a
  project-local role inline with fields such as `label`, `description`,
  `skills`, `skillBundleRefs`, `capabilityBundleRefs`, `runtimeCompatibility`,
  `initialPrompt`, `scopes`, and `polling`. A template can also place role
  files under `roles/<role-slug>/role.json`; those definitions override or
  augment same-named entries from `template.json`. The `auto` and `launchable`
  flags drive how the host product (e.g. AgentCraft) provisions members and
  which roles the UI offers to launch on demand.
- **`capabilityBundleRefs`** — project-level capability packages the role expects.
  These are broader than `skillBundleRefs`: a capability bundle may declare
  tools, MCP servers, skills, hooks, required project globals, and requested
  scopes. Runtime launch still intersects the bundle with the access grant and
  the selected agent type's supported surfaces.
- **`runtimeCompatibility`** — the portable/degraded/native support policy for
  agent types. Hermes, Codex, and Claude Code can expose native plugin or hook
  surfaces when their selected image/adapter includes the right bundle loader.
  Simpler adapters may only receive filesystem skills, prompt instructions,
  context files, and environment variables.
- **`projectGlobals`** — the default project variable schema. Each entry
  declares `{ key, label, description, isSecret, category, required,
  createTaskOnMissing, value }` and is merged into a new project's
  `settings.projectGlobals` on creation. Secret values are never stored here;
  this file only carries non-secret defaults and the schema agents should expect.
- **`projectFileFolders`** - project-relative shared-resource folders that
  should exist as soon as a project is created. AgentCraft passes these through
  to `agent-workspace`, and `agent-workspace` initializes them in project shared
  storage with folder marker objects.
- **`workItemStatusFlow`** - template-owned work-item status semantics and
  automatic dispatch rules. Every template should provide an initial claimable
  status, a feedback/waiting status, a completed terminal status, and a closed
  terminal status. The optional `coordinator` block and `dispatchRules` let the
  host coordinator map unassigned items in specific statuses/work types to
  launchable roles, agent counts, launch mode, and agent type. Coordinator
  activity is recorded as project events such as `COORDINATOR_DISPATCHED_ITEM`,
  `COORDINATOR_BLOCKED`, and `COORDINATOR_IDLE`.

## Layout

```
project-templates/
  <template-id>/
    template.json
    roles/
      <role-slug>/
        role.json
        skills/
          <template-role-skill>/
            SKILL.md
    skills/
      <template-skill>/
        SKILL.md
```

`role://<slug>` is resolved against `../project-roles/<slug>/role.json`.
Inline role definitions are copied into the created project's settings as a
template snapshot, so a project can keep custom specialist roles without adding
them to the global role library.

Template-local skill refs are supported in `skillBundleRefs`:

- `template-skill://<template-id>/<skill-name>` loads
  `<template-id>/skills/<skill-name>/SKILL.md`.
- `template-role-skill://<template-id>/<role-slug>/<skill-name>` loads
  `<template-id>/roles/<role-slug>/skills/<skill-name>/SKILL.md`.

Use `skill://agent-workspace` for the common workspace skill and add
template-local refs for project-specific behavior.

## Default template

`default/template.json` is the canonical project template for AgentCraft. It
mirrors the role set the platform exposes today and ships with an empty
`projectGlobals` list — projects accumulate variables on demand via lead-agent
resource requests.

## Legal contract review template

`legal-contract-review/template.json` is based on the
`external/ai-legal-claude` project. It composes the standard owner and lead
roles with project-local legal specialist roles for clause analysis, risk
assessment, compliance, obligations mapping, and recommendations.

## HackerOne opportunity research template

`hackerone-opportunity-research/template.json` coordinates authorized
HackerOne BBP research. It requires owner-provided `hackerone_username` and
`hackerone_api_token` project globals, records analyzed opportunities in shared
project files, creates one goal per promising program or asset group, and then
dispatches local planner/worker agents with scoped HackerOne context. Discovery
agents must first read `analysed/` and skip project/program URLs already
recorded there; every evaluated candidate appends a record to
`analysed/project-addresses.jsonl` so later passes do not restart from the same
programs. Goal-level target credentials should be requested through owner
resource work items so future runtimes receive them as `PROJECT_GLOBAL_*`
environment variables.

## Status

This abstraction is additive. The `project-roles/` library remains the source
of truth for shared role definitions, while templates can compose shared roles
and add project-local roles. Host products may continue to read
`project-roles/` directly, but new entry points should prefer reading a
template manifest so the role list and default variables stay in lockstep.
