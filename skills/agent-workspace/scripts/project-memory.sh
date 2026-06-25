#!/usr/bin/env bash
set -euo pipefail

project_context_env() {
  if [ -f /opt/data/AGENT_WORKSPACE_RUNTIME.env ]; then
    # shellcheck disable=SC1091
    . /opt/data/AGENT_WORKSPACE_RUNTIME.env
  fi
  : "${AGENT_WORKSPACE_BASE_URL:?AGENT_WORKSPACE_BASE_URL is required}"
  : "${AGENT_WORKSPACE_TOKEN:?AGENT_WORKSPACE_TOKEN is required}"
  : "${AGENT_WORKSPACE_PROJECT_ID:?AGENT_WORKSPACE_PROJECT_ID is required}"
}

project_context_urlencode() {
  node -e 'process.stdout.write(encodeURIComponent(process.argv[1] || ""))' "$1"
}

project-memory-search() {
  project_context_env
  local query="${1:-}"
  local memory_type="${2:-}"
  local limit="${3:-50}"
  local url="$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/memories?limit=$(project_context_urlencode "$limit")"
  if [ -n "$query" ]; then url="$url&q=$(project_context_urlencode "$query")"; fi
  if [ -n "$memory_type" ]; then url="$url&memoryType=$(project_context_urlencode "$memory_type")"; fi
  curl -fsS "$url" -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN"
}

project-memory-write() {
  project_context_env
  local work_item_id="${AGENT_WORKSPACE_WORK_ITEM_ID:-}"
  local priority=""
  local pinned=""
  local audience=""
  local applies_to=""
  local status=""
  local goal_id=""
  local feature_id=""
  local args=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --pinned)
        pinned="true"
        shift
        ;;
      --priority)
        priority="${2:?priority is required after $1}"
        shift 2
        ;;
      --priority=*)
        priority="${1#*=}"
        shift
        ;;
      --audience)
        audience="${2:?audience is required after $1}"
        shift 2
        ;;
      --audience=*)
        audience="${1#*=}"
        shift
        ;;
      --applies-to|--appliesTo)
        applies_to="${2:?applies-to is required after $1}"
        shift 2
        ;;
      --applies-to=*|--appliesTo=*)
        applies_to="${1#*=}"
        shift
        ;;
      --status)
        status="${2:?status is required after $1}"
        shift 2
        ;;
      --status=*)
        status="${1#*=}"
        shift
        ;;
      --goal|--goal-id|--goalId)
        goal_id="${2:?goal id is required after $1}"
        shift 2
        ;;
      --goal=*|--goal-id=*|--goalId=*)
        goal_id="${1#*=}"
        shift
        ;;
      --feature|--feature-id|--featureId)
        feature_id="${2:?feature id is required after $1}"
        shift 2
        ;;
      --feature=*|--feature-id=*|--featureId=*)
        feature_id="${1#*=}"
        shift
        ;;
      --work-item|--workItem|-w)
        work_item_id="${2:?work item id is required after $1}"
        shift 2
        ;;
      --work-item=*|--workItem=*)
        work_item_id="${1#*=}"
        shift
        ;;
      *)
        args+=("$1")
        shift
        ;;
    esac
  done
  local memory_type="${args[0]:?memory type is required}"
  local title="${args[1]:-}"
  local content="${args[2]:-}"
  if [ -z "$content" ]; then
    content="$(cat)"
  fi
  local header_args=()
  if [ -n "$work_item_id" ]; then
    header_args=(-H "X-AgentCraft-Work-Item-Id: $work_item_id")
  fi
  node -e '
    const [
      memoryType,
      title,
      content,
      workItemId,
      priority,
      pinned,
      audience,
      appliesTo,
      status,
      goalId,
      featureId,
    ] = process.argv.slice(1);
    const split = (value) => String(value || "").split(/[,\s]+/).map((item) => item.trim()).filter(Boolean);
    const body = { memoryType, content };
    const metadata = {};
    if (title) body.title = title;
    if (workItemId) body.workItemId = workItemId;
    if (priority) metadata.priority = priority;
    if (pinned) metadata.pinned = ["1", "true", "yes", "pinned"].includes(String(pinned).toLowerCase());
    if (audience) metadata.audience = split(audience);
    if (appliesTo) metadata.appliesTo = split(appliesTo);
    if (status) metadata.status = status;
    if (goalId) metadata.goalId = goalId;
    if (featureId) metadata.featureId = featureId;
    if (Object.keys(metadata).length) body.metadata = metadata;
    process.stdout.write(JSON.stringify(body));
  ' "$memory_type" "$title" "$content" "$work_item_id" "$priority" "$pinned" "$audience" "$applies_to" "$status" "$goal_id" "$feature_id" |
    curl -fsS "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/memories" \
      -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN" \
      -H "Content-Type: application/json" \
      "${header_args[@]}" \
      --data-binary @-
}

project-global-list() {
  project_context_env
  local include_values=""
  case "${1:-}" in
    --include-values|--includeValues|--values)
      include_values="?includeValues=true"
      shift
      ;;
  esac
  curl -fsS "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/globals$include_values" \
    -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN"
}

project-global-write() {
  project_context_env
  local work_item_id="${AGENT_WORKSPACE_WORK_ITEM_ID:-}"
  local source="project-global-write"
  local label=""
  local description=""
  local category=""
  local scope="project"
  local goal_id=""
  local is_secret=""
  local required=""
  local create_task_on_missing=""
  local allow_empty=""
  local args=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --work-item|--workItem|-w)
        work_item_id="${2:?work item id is required after $1}"
        shift 2
        ;;
      --work-item=*|--workItem=*)
        work_item_id="${1#*=}"
        shift
        ;;
      --source)
        source="${2:?source is required after $1}"
        shift 2
        ;;
      --source=*)
        source="${1#*=}"
        shift
        ;;
      --label)
        label="${2:?label is required after $1}"
        shift 2
        ;;
      --label=*)
        label="${1#*=}"
        shift
        ;;
      --description)
        description="${2:?description is required after $1}"
        shift 2
        ;;
      --description=*)
        description="${1#*=}"
        shift
        ;;
      --category)
        category="${2:?category is required after $1}"
        shift 2
        ;;
      --category=*)
        category="${1#*=}"
        shift
        ;;
      --scope)
        scope="${2:?scope is required after $1}"
        shift 2
        ;;
      --scope=*)
        scope="${1#*=}"
        shift
        ;;
      --goal|--goal-id|--goalId)
        goal_id="${2:?goal id is required after $1}"
        scope="goal"
        shift 2
        ;;
      --goal=*|--goal-id=*|--goalId=*)
        goal_id="${1#*=}"
        scope="goal"
        shift
        ;;
      --secret)
        is_secret="true"
        shift
        ;;
      --plain|--public|--not-secret)
        is_secret="false"
        shift
        ;;
      --required)
        required="true"
        shift
        ;;
      --optional)
        required="false"
        shift
        ;;
      --create-task-on-missing)
        create_task_on_missing="true"
        shift
        ;;
      --no-create-task-on-missing)
        create_task_on_missing="false"
        shift
        ;;
      --allow-empty)
        allow_empty="true"
        shift
        ;;
      *)
        args+=("$1")
        shift
        ;;
    esac
  done

  local key="${args[0]:-}"
  if [ -z "$key" ]; then
    echo "project-global-write requires a key" >&2
    return 2
  fi

  local value="${args[1]:-}"
  if [ "${#args[@]}" -lt 2 ]; then
    if [ -t 0 ]; then
      echo "project-global-write requires a value argument or stdin" >&2
      return 2
    fi
    value="$(cat)"
  fi
  if [ -z "$value" ] && [ "$allow_empty" != "true" ]; then
    echo "project-global-write refuses an empty value unless --allow-empty is set" >&2
    return 2
  fi

  local current
  current="$(curl -fsS "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/globals?includeValues=true" \
    -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN")"

  local header_args=()
  if [ -n "$work_item_id" ]; then
    header_args=(-H "X-AgentCraft-Work-Item-Id: $work_item_id")
  fi

  PROJECT_GLOBAL_KEY="$key" \
  PROJECT_GLOBAL_VALUE="$value" \
  PROJECT_GLOBAL_LABEL="$label" \
  PROJECT_GLOBAL_DESCRIPTION="$description" \
  PROJECT_GLOBAL_CATEGORY="$category" \
  PROJECT_GLOBAL_SCOPE="$scope" \
  PROJECT_GLOBAL_GOAL_ID="$goal_id" \
  PROJECT_GLOBAL_IS_SECRET="$is_secret" \
  PROJECT_GLOBAL_REQUIRED="$required" \
  PROJECT_GLOBAL_CREATE_TASK_ON_MISSING="$create_task_on_missing" \
  PROJECT_GLOBAL_WORK_ITEM_ID="$work_item_id" \
  PROJECT_GLOBAL_SOURCE="$source" \
  node -e '
    const fs = require("fs");
    const response = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
    const existingGlobals = Array.isArray(response.globals) ? response.globals : [];
    const env = process.env;
    const bool = (value, fallback) => {
      if (value === undefined || value === null || value === "") return fallback;
      return ["1", "true", "yes", "y"].includes(String(value).toLowerCase());
    };
    const normalized = (entry) => ({
      key: String(entry.key || "").trim(),
      label: entry.label || entry.key || "",
      description: entry.description || null,
      value: entry.value == null ? "" : String(entry.value),
      isSecret: Boolean(entry.isSecret),
      required: entry.required !== false,
      createTaskOnMissing: entry.createTaskOnMissing !== false,
      category: entry.category || null,
      scope: entry.scope === "goal" && entry.goalId ? "goal" : "project",
      goalId: entry.scope === "goal" && entry.goalId ? entry.goalId : null,
    });
    const identity = (entry) =>
      entry.scope === "goal" && entry.goalId
        ? `goal:${entry.goalId}:${entry.key}`
        : `project:${entry.key}`;
    const globals = existingGlobals.map(normalized).filter((entry) => entry.key);
    const scope = env.PROJECT_GLOBAL_SCOPE === "goal" ? "goal" : "project";
    const goalId = scope === "goal" ? String(env.PROJECT_GLOBAL_GOAL_ID || "").trim() : null;
    if (scope === "goal" && !goalId) {
      throw new Error("--goal is required when --scope goal is used");
    }
    const key = String(env.PROJECT_GLOBAL_KEY || "").trim();
    const targetIdentity = identity({ key, scope, goalId });
    const index = globals.findIndex((entry) => identity(entry) === targetIdentity);
    const existing = index >= 0 ? globals[index] : {};
    const next = {
      key,
      label: env.PROJECT_GLOBAL_LABEL || existing.label || key,
      description:
        env.PROJECT_GLOBAL_DESCRIPTION !== undefined && env.PROJECT_GLOBAL_DESCRIPTION !== ""
          ? env.PROJECT_GLOBAL_DESCRIPTION
          : existing.description || null,
      value: env.PROJECT_GLOBAL_VALUE || "",
      isSecret: bool(
        env.PROJECT_GLOBAL_IS_SECRET,
        Object.prototype.hasOwnProperty.call(existing, "isSecret") ? Boolean(existing.isSecret) : true,
      ),
      required: bool(
        env.PROJECT_GLOBAL_REQUIRED,
        Object.prototype.hasOwnProperty.call(existing, "required") ? existing.required !== false : true,
      ),
      createTaskOnMissing: bool(
        env.PROJECT_GLOBAL_CREATE_TASK_ON_MISSING,
        Object.prototype.hasOwnProperty.call(existing, "createTaskOnMissing") ? existing.createTaskOnMissing !== false : true,
      ),
      category:
        env.PROJECT_GLOBAL_CATEGORY !== undefined && env.PROJECT_GLOBAL_CATEGORY !== ""
          ? env.PROJECT_GLOBAL_CATEGORY
          : existing.category || null,
      scope,
      goalId,
    };
    const nextGlobals = index >= 0
      ? globals.map((entry, entryIndex) => (entryIndex === index ? next : entry))
      : [...globals, next];
    const body = {
      globals: nextGlobals,
      source: env.PROJECT_GLOBAL_SOURCE || "project-global-write",
    };
    if (env.PROJECT_GLOBAL_WORK_ITEM_ID) body.workItemId = env.PROJECT_GLOBAL_WORK_ITEM_ID;
    process.stdout.write(JSON.stringify(body));
  ' <<< "$current" |
    curl -fsS -X PUT "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/globals" \
      -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN" \
      -H "Content-Type: application/json" \
      "${header_args[@]}" \
      --data-binary @-
}

project-global-set() {
  project-global-write "$@"
}

project_memory_usage() {
  cat <<'EOF'
Usage:
  . project-memory.sh
  project-memory-search [query] [memoryType] [limit]
  project-memory-write [--work-item <workItemId>] [--pinned] [--priority critical] [--audience LEAD_AGENT,PLANNER_AGENT] [--applies-to resume,planning] <memoryType> [title] [content]
  project-global-list [--include-values]
  project-global-write [--plain|--secret] [--label <label>] [--description <description>] [--category <category>] [--goal <goalId>] [--work-item <workItemId>] <key> [value]

  bash project-memory.sh <command> [args]

Commands:
  search, project-memory-search [query] [memoryType] [limit]
  write, project-memory-write [--work-item <workItemId>] [--pinned] [--priority critical] [--audience LEAD_AGENT,PLANNER_AGENT] [--applies-to resume,planning] <memoryType> [title] [content]
  global-list, globals, project-global-list
  global-write, global-set, project-global-write, project-global-set [options] <key> [value]

Notes:
  Review-gated handoff memory candidates should be approved through the
  review API details, not written directly with project-memory-write.
EOF
}

project_memory_main() {
  local command="${1:-}"
  case "$command" in
    ""|-h|--help|help)
      project_memory_usage
      ;;
    search|project-memory-search)
      shift
      project-memory-search "$@"
      ;;
    write|project-memory-write)
      shift
      project-memory-write "$@"
      ;;
    global-list|globals|project-global-list)
      shift
      project-global-list "$@"
      ;;
    global-write|global-set|project-global-write|project-global-set)
      shift
      project-global-write "$@"
      ;;
    *)
      echo "unknown project memory command: $command" >&2
      project_memory_usage >&2
      return 2
      ;;
  esac
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  project_memory_main "$@"
fi
