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
  local memory_type="${1:?memory type is required}"
  local title="${2:-}"
  local content="${3:-}"
  if [ -z "$content" ]; then
    content="$(cat)"
  fi
  node -e '
    const [memoryType, title, content] = process.argv.slice(1);
    const body = { memoryType, content };
    if (title) body.title = title;
    process.stdout.write(JSON.stringify(body));
  ' "$memory_type" "$title" "$content" |
    curl -fsS "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/memories" \
      -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN" \
      -H "Content-Type: application/json" \
      --data-binary @-
}

project-global-list() {
  project_context_env
  curl -fsS "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/globals?includeValues=true" \
    -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN"
}
