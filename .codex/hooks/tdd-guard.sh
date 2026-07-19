#!/usr/bin/env bash
# TDD Guard Hook
# Blocks production edits when no corresponding test file exists.

set -euo pipefail

INPUT="$(cat)"

deny() {
  python3 -c 'import json, sys; print(json.dumps({
    "hookSpecificOutput": {
      "hookEventName": "PreToolUse",
      "permissionDecision": "deny",
      "permissionDecisionReason": sys.argv[1],
    }
  }))' "$1"
  exit 0
}

repo_root() {
  git rev-parse --show-toplevel 2>/dev/null || pwd
}

normalize_path() {
  local path="$1"
  path="${path#./}"
  path="${path#/}"
  printf '%s\n' "$path"
}

is_test_file() {
  local path="$1"
  local base
  base="$(basename "$path")"

  [[ "$path" == */test/* ]] && return 0
  [[ "$path" == */tests/* ]] && return 0
  [[ "$path" == */__tests__/* ]] && return 0
  [[ "$base" == test_* ]] && return 0
  [[ "$base" == *_test.* ]] && return 0
  [[ "$base" == *.test.* ]] && return 0
  [[ "$base" == *.spec.* ]] && return 0

  return 1
}

is_exempt_file() {
  local path="$1"
  local base
  base="$(basename "$path")"

  [[ "$path" == .codex/* ]] && return 0
  [[ "$path" == docs/* ]] && return 0
  [[ "$path" == phases/* ]] && return 0
  [[ "$base" == AGENTS.md ]] && return 0
  [[ "$base" == README.md ]] && return 0
  [[ "$base" == .gitignore ]] && return 0
  [[ "$base" == *.md ]] && return 0
  [[ "$base" == *.json ]] && return 0
  [[ "$base" == *.yaml ]] && return 0
  [[ "$base" == *.yml ]] && return 0
  [[ "$base" == *.toml ]] && return 0
  [[ "$base" == *.lock ]] && return 0
  [[ "$base" == *.txt ]] && return 0

  return 1
}

is_code_file() {
  local path="$1"

  case "$path" in
    *.py|*.js|*.jsx|*.ts|*.tsx|*.mjs|*.cjs|*.go|*.rs|*.java|*.kt|*.swift|*.rb|*.php|*.sh)
      return 0
      ;;
  esac

  return 1
}

has_corresponding_test() {
  local path="$1"
  local dir base stem

  dir="$(dirname "$path")"
  base="$(basename "$path")"
  stem="${base%.*}"

  local candidates=(
    "$dir/${stem}.test.py"
    "$dir/${stem}.spec.py"
    "$dir/test_${stem}.py"
    "$dir/${stem}_test.py"
    "$dir/${stem}.test.js"
    "$dir/${stem}.spec.js"
    "$dir/${stem}.test.jsx"
    "$dir/${stem}.spec.jsx"
    "$dir/${stem}.test.ts"
    "$dir/${stem}.spec.ts"
    "$dir/${stem}.test.tsx"
    "$dir/${stem}.spec.tsx"
    "$dir/__tests__/${stem}.py"
    "$dir/__tests__/${stem}.js"
    "$dir/__tests__/${stem}.jsx"
    "$dir/__tests__/${stem}.ts"
    "$dir/__tests__/${stem}.tsx"
  )

  local candidate
  for candidate in "${candidates[@]}"; do
    [[ -f "$candidate" ]] && return 0
  done

  if [[ -d tests ]]; then
    if find tests -type f \( \
      -name "${stem}.test.*" -o \
      -name "${stem}.spec.*" -o \
      -name "test_${stem}.py" -o \
      -name "${stem}_test.py" \
    \) -print -quit | grep -q .; then
      return 0
    fi
  fi

  return 1
}

extract_paths() {
  python3 -c '
import json
import re
import sys

raw = sys.stdin.read()
if not raw.strip():
    sys.exit(0)

data = json.loads(raw)
tool_input = data.get("tool_input") or {}
paths = []

for key in ("file_path", "filepath", "path"):
    value = tool_input.get(key)
    if isinstance(value, str):
        paths.append(value)

command = tool_input.get("command")
if isinstance(command, str):
    for line in command.splitlines():
        match = re.match(r"^\*\*\* (?:Add|Update|Delete) File: (.+)$", line)
        if match:
            paths.append(match.group(1).strip())

seen = set()
for path in paths:
    path = path.strip()
    if path and path not in seen:
        seen.add(path)
        print(path)
' <<< "$INPUT"
}

ROOT="$(repo_root)"
cd "$ROOT"

while IFS= read -r raw_path; do
  [[ -z "$raw_path" ]] && continue

  path="$(normalize_path "$raw_path")"

  if is_exempt_file "$path" || is_test_file "$path"; then
    continue
  fi

  if ! is_code_file "$path"; then
    continue
  fi

  if ! has_corresponding_test "$path"; then
    deny "TDD Guard: No corresponding test file found for ${path}. Create or update a failing test first, run it red, then modify implementation code."
  fi
done < <(extract_paths)

exit 0
