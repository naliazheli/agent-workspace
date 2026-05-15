#!/usr/bin/env bash
set -euo pipefail

project_file_env() {
  if [ -f /opt/data/AGENT_WORKSPACE_RUNTIME.env ]; then
    # shellcheck disable=SC1091
    . /opt/data/AGENT_WORKSPACE_RUNTIME.env
  fi
  : "${AGENT_WORKSPACE_BASE_URL:?AGENT_WORKSPACE_BASE_URL is required}"
  : "${AGENT_WORKSPACE_TOKEN:?AGENT_WORKSPACE_TOKEN is required}"
  : "${AGENT_WORKSPACE_PROJECT_ID:?AGENT_WORKSPACE_PROJECT_ID is required}"
}

project_file_urlencode() {
  node -e 'process.stdout.write(encodeURIComponent(process.argv[1] || ""))' "$1"
}

project-file-list() {
  project_file_env
  local prefix="${1:-}"
  local query="${2:-}"
  local recursive="${3:-true}"
  local url="$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/files?limit=100&recursive=$recursive"
  if [ -n "$prefix" ]; then url="$url&prefix=$(project_file_urlencode "$prefix")"; fi
  if [ -n "$query" ]; then url="$url&q=$(project_file_urlencode "$query")"; fi
  curl -fsS "$url" -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN"
}

project-file-search() {
  project-file-list "${1:-}" "${2:-$1}"
}

project-file-read() {
  project_file_env
  local file_path="${1:?path is required}"
  local encoding="${2:-text}"
  curl -fsS "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/files/read?path=$(project_file_urlencode "$file_path")&encoding=$encoding" \
    -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN"
}

project-file-write() {
  project_file_env
  local file_path="${1:?path is required}"
  local source="${2:-}"
  local content
  if [ -n "$source" ] && [ -f "$source" ]; then
    content="$(cat "$source")"
  else
    content="$(cat)"
  fi
  node -e 'process.stdout.write(JSON.stringify({ path: process.argv[1], content: process.argv[2], encoding: "text" }))' "$file_path" "$content" |
    curl -fsS "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/files/write" \
      -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN" \
      -H "Content-Type: application/json" \
      --data-binary @-
}

project-file-upload() {
  project_file_env
  local local_path="${1:?local file path is required}"
  local remote_path="${2:-$(basename "$local_path")}"
  curl -fsS "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/files/upload" \
    -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN" \
    -F "path=$remote_path" \
    -F "file=@$local_path"
}

project-folder-create() {
  project_file_env
  local folder_path="${1:?folder path is required}"
  node -e 'process.stdout.write(JSON.stringify({ path: process.argv[1] }))' "$folder_path" |
    curl -fsS "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/files/folders" \
      -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN" \
      -H "Content-Type: application/json" \
      --data-binary @-
}

project-file-delete() {
  project_file_env
  local file_path="${1:?path is required}"
  local recursive="${2:-false}"
  curl -fsS -X DELETE "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/files?path=$(project_file_urlencode "$file_path")&recursive=$recursive" \
    -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN"
}

project-file-download() {
  project_file_env
  local file_path="${1:?path is required}"
  local output_path="${2:-$(basename "$file_path")}"
  curl -fsS "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/files/download?path=$(project_file_urlencode "$file_path")" \
    -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN" \
    -o "$output_path"
}

project-file-download-url() {
  project_file_env
  local file_path="${1:?path is required}"
  curl -fsS "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/files/download-url?path=$(project_file_urlencode "$file_path")" \
    -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN"
}
