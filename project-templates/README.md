# project-templates/

A **project template** is one level of abstraction above a single agent role: it
describes a complete starting point for a new project.

A template bundles:

- **`roles`** — the ordered set of roles the project ships with. Each entry
  may reference a role definition from the shared role library at
  `../project-roles/<slug>/role.json` via `role://<slug>`, or define a
  project-local role inline with fields such as `label`, `description`,
  `skills`, `skillBundleRefs`, `initialPrompt`, `scopes`, and `polling`. The
  `auto` and `launchable` flags drive how the host product (e.g. AgentCraft)
  provisions members and which roles the UI offers to launch on demand.
- **`projectGlobals`** — the default project variable schema. Each entry
  declares `{ key, label, description, isSecret, category, required,
  createTaskOnMissing, value }` and is merged into a new project's
  `settings.projectGlobals` on creation. Secret values are never stored here;
  this file only carries non-secret defaults and the schema agents should expect.

## Layout

```
project-templates/
  <template-id>/
    template.json
```

`role://<slug>` is resolved against `../project-roles/<slug>/role.json`.
Inline role definitions are copied into the created project's settings as a
template snapshot, so a project can keep custom specialist roles without adding
them to the global role library.

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

## Status

This abstraction is additive. The `project-roles/` library remains the source
of truth for shared role definitions, while templates can compose shared roles
and add project-local roles. Host products may continue to read
`project-roles/` directly, but new entry points should prefer reading a
template manifest so the role list and default variables stay in lockstep.
