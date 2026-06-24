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
  curl -fsS "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/globals?includeValues=true" \
    -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN"
}

project_memory_usage() {
  cat <<'EOF'
Usage:
  . project-memory.sh
  project-memory-search [query] [memoryType] [limit]
  project-memory-write [--work-item <workItemId>] [--pinned] [--priority critical] [--audience LEAD_AGENT,PLANNER_AGENT] [--applies-to resume,planning] <memoryType> [title] [content]
  project-global-list

  bash project-memory.sh <command> [args]

Commands:
  search, project-memory-search [query] [memoryType] [limit]
  write, project-memory-write [--work-item <workItemId>] [--pinned] [--priority critical] [--audience LEAD_AGENT,PLANNER_AGENT] [--applies-to resume,planning] <memoryType> [title] [content]
  global-list, globals, project-global-list

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
