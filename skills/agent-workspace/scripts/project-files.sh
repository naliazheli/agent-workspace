#!/usr/bin/env bash
set -euo pipefail

PROJECT_FILE_CONTEXT_HEADER_ARGS=()
PROJECT_FILE_CONTEXT_WORK_ITEM_ID=""
PROJECT_FILE_REMAINING_ARGS=()

project_file_parse_context_args() {
  PROJECT_FILE_CONTEXT_WORK_ITEM_ID=""
  PROJECT_FILE_REMAINING_ARGS=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --work-item|--work-item-id)
        if [ "$#" -lt 2 ]; then
          echo "missing value after $1" >&2
          return 2
        fi
        PROJECT_FILE_CONTEXT_WORK_ITEM_ID="$2"
        shift 2
        ;;
      --work-item=*|--work-item-id=*)
        PROJECT_FILE_CONTEXT_WORK_ITEM_ID="${1#*=}"
        shift
        ;;
      *)
        PROJECT_FILE_REMAINING_ARGS+=("$1")
        shift
        ;;
    esac
  done
}

project_file_context_headers() {
  PROJECT_FILE_CONTEXT_HEADER_ARGS=()
  local work_item_id="${PROJECT_FILE_CONTEXT_WORK_ITEM_ID:-${AGENT_WORKSPACE_WORK_ITEM_ID:-${AIFACTORY_WORK_ITEM_ID:-${PROJECT_WORK_ITEM_ID:-${WORK_ITEM_ID:-}}}}}"
  if [ -n "$work_item_id" ]; then
    PROJECT_FILE_CONTEXT_HEADER_ARGS=(-H "X-AgentCraft-Work-Item-Id: $work_item_id")
  fi
}

project_file_env() {
  if [ -f /opt/data/AGENT_WORKSPACE_RUNTIME.env ]; then
    # shellcheck disable=SC1091
    . /opt/data/AGENT_WORKSPACE_RUNTIME.env
  fi
  : "${AGENT_WORKSPACE_BASE_URL:?AGENT_WORKSPACE_BASE_URL is required}"
  : "${AGENT_WORKSPACE_TOKEN:?AGENT_WORKSPACE_TOKEN is required}"
  : "${AGENT_WORKSPACE_PROJECT_ID:?AGENT_WORKSPACE_PROJECT_ID is required}"
  project_file_context_headers
}

project_file_urlencode() {
  node -e 'process.stdout.write(encodeURIComponent(process.argv[1] || ""))' "$1"
}

project-file-list() {
  project_file_parse_context_args "$@"
  project_file_env
  local prefix="${PROJECT_FILE_REMAINING_ARGS[0]:-}"
  local query="${PROJECT_FILE_REMAINING_ARGS[1]:-}"
  local recursive="${PROJECT_FILE_REMAINING_ARGS[2]:-true}"
  local url="$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/files?limit=100&recursive=$recursive"
  if [ -n "$prefix" ]; then url="$url&prefix=$(project_file_urlencode "$prefix")"; fi
  if [ -n "$query" ]; then url="$url&q=$(project_file_urlencode "$query")"; fi
  curl -fsS "$url" -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN" "${PROJECT_FILE_CONTEXT_HEADER_ARGS[@]}"
}

project-file-search() {
  project_file_parse_context_args "$@"
  project_file_env
  local prefix="${PROJECT_FILE_REMAINING_ARGS[0]:-}"
  local query="${PROJECT_FILE_REMAINING_ARGS[1]:-${PROJECT_FILE_REMAINING_ARGS[0]:-}}"
  local url="$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/files?limit=100&recursive=true"
  if [ -n "$prefix" ]; then url="$url&prefix=$(project_file_urlencode "$prefix")"; fi
  if [ -n "$query" ]; then url="$url&q=$(project_file_urlencode "$query")"; fi
  curl -fsS "$url" -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN" "${PROJECT_FILE_CONTEXT_HEADER_ARGS[@]}"
}

project-file-read() {
  project_file_parse_context_args "$@"
  project_file_env
  local file_path="${PROJECT_FILE_REMAINING_ARGS[0]:?path is required}"
  local encoding="${PROJECT_FILE_REMAINING_ARGS[1]:-text}"
  curl -fsS "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/files/read?path=$(project_file_urlencode "$file_path")&encoding=$encoding" \
    -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN" \
    "${PROJECT_FILE_CONTEXT_HEADER_ARGS[@]}"
}

project-file-write() {
  project_file_parse_context_args "$@"
  project_file_env
  local file_path="${PROJECT_FILE_REMAINING_ARGS[0]:?path is required}"
  local source="${PROJECT_FILE_REMAINING_ARGS[1]:-}"
  if [ -n "$source" ] && [ -f "$source" ]; then
    local size
    size="$(wc -c < "$source" | tr -d ' ')"
    if [ "${size:-0}" -gt 750000 ]; then
      curl -fsS "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/files/upload" \
        -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN" \
        "${PROJECT_FILE_CONTEXT_HEADER_ARGS[@]}" \
        -F "path=$file_path" \
        -F "file=@$source"
      return
    fi
    node -e 'const fs=require("fs"); process.stdout.write(JSON.stringify({ path: process.argv[1], content: fs.readFileSync(process.argv[2], "utf8"), encoding: "text" }))' "$file_path" "$source" |
      curl -fsS "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/files/write" \
        -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN" \
        -H "Content-Type: application/json" \
        "${PROJECT_FILE_CONTEXT_HEADER_ARGS[@]}" \
        --data-binary @-
  else
    node -e 'const fs=require("fs"); process.stdout.write(JSON.stringify({ path: process.argv[1], content: fs.readFileSync(0, "utf8"), encoding: "text" }))' "$file_path" |
      curl -fsS "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/files/write" \
        -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN" \
        -H "Content-Type: application/json" \
        "${PROJECT_FILE_CONTEXT_HEADER_ARGS[@]}" \
        --data-binary @-
  fi
}

project-file-upload() {
  project_file_parse_context_args "$@"
  project_file_env
  local local_path="${PROJECT_FILE_REMAINING_ARGS[0]:?local file path is required}"
  local remote_path="${PROJECT_FILE_REMAINING_ARGS[1]:-$(basename "$local_path")}"
  curl -fsS "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/files/upload" \
    -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN" \
    "${PROJECT_FILE_CONTEXT_HEADER_ARGS[@]}" \
    -F "path=$remote_path" \
    -F "file=@$local_path"
}

project-folder-create() {
  project_file_parse_context_args "$@"
  project_file_env
  local folder_path="${PROJECT_FILE_REMAINING_ARGS[0]:?folder path is required}"
  node -e 'process.stdout.write(JSON.stringify({ path: process.argv[1] }))' "$folder_path" |
    curl -fsS "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/files/folders" \
      -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN" \
      -H "Content-Type: application/json" \
      "${PROJECT_FILE_CONTEXT_HEADER_ARGS[@]}" \
      --data-binary @-
}

project-file-delete() {
  project_file_parse_context_args "$@"
  project_file_env
  local file_path="${PROJECT_FILE_REMAINING_ARGS[0]:?path is required}"
  local recursive="${PROJECT_FILE_REMAINING_ARGS[1]:-false}"
  curl -fsS -X DELETE "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/files?path=$(project_file_urlencode "$file_path")&recursive=$recursive" \
    -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN" \
    "${PROJECT_FILE_CONTEXT_HEADER_ARGS[@]}"
}

project-file-download() {
  project_file_parse_context_args "$@"
  project_file_env
  local file_path="${PROJECT_FILE_REMAINING_ARGS[0]:?path is required}"
  local output_path="${PROJECT_FILE_REMAINING_ARGS[1]:-$(basename "$file_path")}"
  curl -fsS "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/files/download?path=$(project_file_urlencode "$file_path")" \
    -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN" \
    "${PROJECT_FILE_CONTEXT_HEADER_ARGS[@]}" \
    -o "$output_path"
}

project-file-download-url() {
  project_file_parse_context_args "$@"
  project_file_env
  local file_path="${PROJECT_FILE_REMAINING_ARGS[0]:?path is required}"
  curl -fsS "$AGENT_WORKSPACE_BASE_URL/v1/projects/$AGENT_WORKSPACE_PROJECT_ID/files/download-url?path=$(project_file_urlencode "$file_path")" \
    -H "Authorization: Bearer $AGENT_WORKSPACE_TOKEN" \
    "${PROJECT_FILE_CONTEXT_HEADER_ARGS[@]}"
}

project_file_usage() {
  cat <<'EOF'
Usage:
  . project-files.sh
  project-file-read [--work-item <id>] <path> [text|base64]

  bash project-files.sh <command> [args]

Commands:
  list, project-file-list [prefix] [query] [recursive]
  search, project-file-search [prefix] [query]
  read, project-file-read <path> [text|base64]
  write, project-file-write <path> [local-source]
  upload, project-file-upload <local-path> [remote-path]
  folder-create, project-folder-create <path>
  delete, project-file-delete <path> [recursive]
  download, project-file-download <path> [output-path]
  download-url, project-file-download-url <path>

Options:
  --work-item, --work-item-id <id>  Bind the operation to a work item.
EOF
}

project_file_main() {
  local command="${1:-}"
  case "$command" in
    ""|-h|--help|help)
      project_file_usage
      ;;
    list|project-file-list)
      shift
      project-file-list "$@"
      ;;
    search|project-file-search)
      shift
      project-file-search "$@"
      ;;
    read|project-file-read)
      shift
      project-file-read "$@"
      ;;
    write|project-file-write)
      shift
      project-file-write "$@"
      ;;
    upload|project-file-upload)
      shift
      project-file-upload "$@"
      ;;
    folder-create|project-folder-create|mkdir)
      shift
      project-folder-create "$@"
      ;;
    delete|project-file-delete|rm)
      shift
      project-file-delete "$@"
      ;;
    download|project-file-download)
      shift
      project-file-download "$@"
      ;;
    download-url|project-file-download-url)
      shift
      project-file-download-url "$@"
      ;;
    *)
      echo "unknown project file command: $command" >&2
      project_file_usage >&2
      return 2
      ;;
  esac
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  project_file_main "$@"
fi
