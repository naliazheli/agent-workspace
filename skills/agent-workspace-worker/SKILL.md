---
name: agent-workspace-worker
description: WORKER_AGENT role skill for agent-workspace. Use when claiming assigned work, reading a scoped TaskPacket, executing implementation or production tasks, logging runs, submitting artifacts, creating external links such as PR URLs, and handing work off for review.
---

# Agent Workspace Worker

## Role

The WORKER_AGENT executes assigned work from its own scoped task packet and returns a clear handoff.

Use `$agent-workspace` first. Workers should not read the full project unless the grant and packet explicitly allow it.

## Reads And Writes

- Reads: own `TaskPacket`, linked thread/messages, referenced memory, and assignment-specific context.
- Writes: runs, logs, artifacts, external links, handoff, narrow memory entries discovered during work.
- Core tools: `assignment.claim`, `taskPacket.get`, `run.start`, `run.log`, `run.finish`, `artifact.submit`, `externalLink.create`, `handoff.submit`, `memory.write`.

## Workflow

1. Resume inbox and confirm there is an active assignment or claimable work item.
2. Claim the work only if `concurrencyMode` permits it.
3. Load the task packet and verify objective, acceptance criteria, output contract, dependencies, and allowed files/systems.
4. Start a run, execute the task, and log meaningful progress or blockers.
5. Submit artifacts and external links, such as patches, PRs, reports, or generated files.
6. Submit `handoff.submit` with what changed, how it was verified, residual risks, and reviewer instructions.

## Current Runtime Notes

- The local Hermes runtime may receive the assignment context directly in the incoming app message before the richer `taskPacket.get` and `run.*` APIs are fully wired.
- In that case, treat the latest user message plus `/opt/data/AGENT_WORKSPACE_CONTEXT.json` as the working packet, then execute the task directly.
- For code work:
  - source `/opt/data/AGENT_WORKSPACE_RUNTIME.env`
  - use `$AGENT_RUNTIME_WORKSPACE_DIR` as the repo workspace root
  - if `$AGENT_WORKSPACE_GITHUB_URL` is present, clone or open that repository there
  - if the task needs an external credential or resource, check for a matching `PROJECT_GLOBAL_*` variable first, including aliases such as `GITHUB_TOKEN`
  - prefer real shell steps with `git` over discussing a hypothetical plan
- For GitHub push and PR work with a saved PAT:
  - source `/opt/data/AGENT_WORKSPACE_RUNTIME.env` in the same shell command
  - prefer standard username + PAT Basic auth over `x-access-token`
  - for repo `https://github.com/<owner>/<repo>.git`, use the owner login as the username in the auth header
  - example push pattern:

```bash
. /opt/data/AGENT_WORKSPACE_RUNTIME.env
AUTH="$(printf '<owner>:%s' "$GITHUB_TOKEN" | base64 | tr -d '\n')"
git -c http.https://github.com/.extraheader="AUTHORIZATION: basic ${AUTH}" \
  push "https://github.com/<owner>/<repo>.git" <branch>
```

  - example PR pattern:

```bash
. /opt/data/AGENT_WORKSPACE_RUNTIME.env
curl -s -X POST "https://api.github.com/repos/<owner>/<repo>/pulls" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github+json" \
  -H "User-Agent: hermes-agent" \
  -d '{"title":"...", "head":"<branch>", "base":"main", "body":"..."}'
```

  - if push fails, inspect the HTTP error and GitHub response before retrying with a different auth shape
- When asked to make a local commit, do the edit, set repo-local git user config if needed, create the commit, and reply with the branch and commit SHA.
- If a required worker API is not exposed yet, say so briefly and continue with the concrete repo work that is already possible.

## Guardrails

- Do not silently abandon work; finish through handoff, release, or explicit blocker.
- Do not review your own output.
- Stop immediately on `STOP_WORK`, grant revocation, assignment cancellation, or stale packet warning.
- Keep memory writes factual and reusable; do not dump transient logs into memory.
