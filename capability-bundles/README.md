# Capability Bundles

Capability bundles describe project-level agent capabilities before they are
materialized into a concrete runtime. They are intentionally broader than
`skillBundleRefs`: a bundle can declare skills, MCP servers, tools, hooks,
required project globals, requested scopes, and runtime compatibility.

`skillBundleRefs` stay as the portable delivery mechanism for today's agent
types. `capabilityBundleRefs` are the durable project/audit abstraction.

## Manifest Shape

```json
{
  "ref": "capability://agent-workspace/core",
  "name": "agent-workspace core",
  "version": "0.1",
  "description": "Common project runtime entry and scoped workspace API access.",
  "surfaces": {
    "skills": ["skill://agent-workspace"],
    "tools": ["agent-workspace.v0.project.get"],
    "mcpServers": [],
    "hooks": []
  },
  "requiredScopes": ["PROJECT_READ_BASIC", "PROJECT_INBOX_READ"],
  "requiredProjectGlobals": [],
  "runtimeCompatibility": {
    "requiredFeatures": ["filesystemSkills", "skillPrompts"],
    "optionalFeatures": ["nativePlugins", "pluginHooks", "mcpServers"]
  }
}
```

Runtime launch should:

1. Resolve role `capabilityBundleRefs` and `skillBundleRefs`.
2. Intersect requested scopes with the role/project access grant.
3. Materialize only the surfaces supported by the selected agent type.
4. Record degraded or skipped surfaces in runtime metadata and the project audit
   surface.
