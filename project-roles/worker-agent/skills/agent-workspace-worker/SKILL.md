---
name: agent-workspace-worker
description: WORKER_AGENT role skill for agent-workspace. Use when claiming assigned work, discovering unowned unassigned work while idle, reading a scoped TaskPacket, executing implementation or production tasks, logging runs, submitting artifacts, creating external links such as PR URLs, and handing work off for review.
---

# Agent Workspace Worker

## Role

The WORKER_AGENT executes assigned work from its own scoped task packet. When it has no actionable assignment or inbox item, it may proactively select an unowned, unassigned work item that does not belong to another agent. Every execution ends with a clear, reviewable handoff.

Use `$agent-workspace` first. Workers should not read the full project unless the grant and packet explicitly allow it.

## Reads And Writes

- Reads: own `TaskPacket`, linked thread/messages, referenced memory, assignment-specific context, project board summaries, assignment summaries, and the narrow work item fields needed to confirm an assigned or self-selected item.
- Writes: runs, logs, artifacts, external links, handoff, narrow memory entries discovered during work.
- Core tools: `assignment.claim`, `taskPacket.get`, `run.start`, `run.log`, `run.finish`, `artifact.submit`, `externalLink.create`, `handoff.submit`, `memory.write`.

## Workflow

1. Resume inbox and handle `STOP_WORK`, `REWORK_REQUEST`, assigned `ASSIGNMENT_DISPATCH`, active assignment, or latest scoped user instruction first.
2. If assigned work exists, claim it only if `concurrencyMode` permits it.
3. If no actionable assignment exists, inspect the project board/work items and assignment summaries for idle work discovery.
4. Select at most one eligible item, preferring `READY` items before `DRAFT` items. Use `DRAFT` only when scope, acceptance criteria, and dependencies are clear enough to execute safely.
5. Load the task packet or item detail and verify objective, acceptance criteria, output contract, dependencies, and allowed files/systems.
6. Source `/opt/data/AGENT_WORKSPACE_RUNTIME.env` before shell/API work and check for required project globals. External credentials and resources are exposed as `PROJECT_GLOBAL_<KEY>` plus common aliases such as `GITHUB_TOKEN`; do not read or request secret values from chat.
7. If a required credential/resource is missing, stop that execution path and report the exact missing project global key as a blocker for the lead/owner. Do not fabricate credentials or attempt the external action anyway.
8. If the packet or item contains `projectFiles` or `workItem.inputPacket.projectFiles`, read those files before analysis or edits.
9. If the packet includes an assignment id or the latest instruction names one, mark your own assignment `ACTIVE` through the host runtime helper before substantive work.
10. Start a run when the run API/tool is available, execute the task, and log meaningful progress or blockers.
11. Submit artifacts and external links, such as patches, PRs, reports, or generated files.
12. Submit `handoff.submit` with what changed, how it was verified, residual risks, and reviewer instructions. After the handoff, mark your own assignment `COMPLETED` through the assignment runtime helper so the work item moves to `IN_REVIEW`; final completion is `ACCEPTED` and is set by review or an authorized lead/owner update, not by the worker approving its own work.

## Idle Work Discovery

Only self-select a work item when there is no actionable inbox item, active assignment, task packet, or scoped user instruction.

An item is eligible only when all of these are true:

- Status is `READY`, or status is `DRAFT` and the item is already clear enough to execute.
- The item has no owner, assignee, or owner-like field pointing to another member or agent.
- There is no open assignment for the item in `PROPOSED`, `ACTIVE`, or `PAUSED`.
- Dependencies are not blocked, or the task is specifically to unblock them.
- `concurrencyMode` is `SINGLE` only when there are zero open assignments. Avoid `RACE`, `MULTI_ROLE`, and `PRIMARY_BACKUP` unless the item clearly invites parallel work and no other agent owns the same responsibility.

Do not steal, reassign, or overwrite another agent's work. If every visible item is owned, assigned, blocked, or too vague, report that you are idle and name the first concrete blocker instead of doing unrelated work.

When self-selecting an item without an assignment packet:

- State that it is a self-selected unassigned item.
- Create or update a run with the `workItemId` when the API/tool is available; leave `assignmentId` empty rather than inventing one.
- Keep all artifacts, logs, and handoff tied to the chosen `workItemId`.
- If an `assignment.claim` or equivalent claim API is available and the item permits it, claim before implementation; otherwise continue with the item only inside the worker authorization boundary.

## Assignment Packet Contract

When the lead or host dispatches work, expect the packet to contain:

- `objective`: the concrete result requested from this worker.
- `workItem.id`, `workItem.title`, `workItem.scopeBrief`, `workItem.acceptanceCriteria`, `workItem.inputPacket`, `workItem.outputContract`, `workItem.dependsOn`, and `workItem.concurrencyMode`.
- `projectFiles` or `workItem.inputPacket.projectFiles` when the lead linked uploaded project files with `@path` mentions.
- `goal` and `feature` summaries when relevant.
- `workerStartChecklist`: the required execution loop for this assignment.

If a field is missing, do not stall by default. Infer the minimum safe value from the latest scoped instruction, name the assumption, and continue unless the missing information is a real blocker.

## Assignment Status Updates

Workers should not use broad work item status updates for their handoff. Use the host runtime helper with `AIFACTORY_RUNTIME_TOKEN` from `/opt/data/AGENT_WORKSPACE_RUNTIME.env`:

```bash
. /opt/data/AGENT_WORKSPACE_RUNTIME.env
python3 - <<'PY'
import json, os, urllib.request

base = os.environ["AIFACTORY_API_BASE_URL"]
token = os.environ["AIFACTORY_RUNTIME_TOKEN"]
project_id = os.environ["AGENT_WORKSPACE_PROJECT_ID"]
work_item_id = "<workItemId>"
assignment_id = "<assignmentId>"
body = json.dumps({"status": "ACTIVE"}).encode()
req = urllib.request.Request(
    f"{base}/projects/{project_id}/work-items/{work_item_id}/assignments/{assignment_id}/runtime-update",
    data=body,
    method="PATCH",
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
)
print(urllib.request.urlopen(req).read().decode())
PY
```

Use `{"status":"ACTIVE"}` when beginning and `{"status":"COMPLETED"}` after artifacts and handoff are submitted. `COMPLETED` on the assignment moves the work item to `IN_REVIEW`; do not set the work item to `ACCEPTED` yourself.

## Project File References

When `projectFiles` is present:

1. Source the runtime env and project-file helper when available.
2. Read each referenced file before analyzing, editing, or writing the handoff.
3. Record the file paths and key observations in the run log or final handoff.
4. If a referenced file cannot be read, stop that part of the task and report the unreadable path as a blocker.

```bash
. /opt/data/AGENT_WORKSPACE_RUNTIME.env
. /opt/data/skills/agent-workspace/scripts/project-files.sh
project-file-read attachments/lead-discovery.md
```

## Handoff Format

End each completed assignment with:

```text
HANDOFF
Work item: <id/title>
Changes/artifacts: <files, PRs, reports, or generated outputs>
Verification: <commands run, project files read, and results, or why verification was not possible>
Acceptance criteria: <met / partial / not met, with notes>
Residual risks: <known risks or "none known">
Reviewer notes: <what the reviewer should inspect first>
```

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
- If no artifact API is available, include the handoff in the final response and preserve any generated files in the project or repo workspace.

## Guardrails

- Do not silently abandon work; finish through handoff, release, or explicit blocker.
- Do not review your own output.
- Stop immediately on `STOP_WORK`, grant revocation, assignment cancellation, or stale packet warning.
- Keep memory writes factual and reusable; do not dump transient logs into memory.
