#!/usr/bin/env python3
"""Repository PreToolUse policy for Codex hooks."""

import json
import re
import sys


BLOCKED_PATTERNS = [
    (re.compile(r"\brm\s+-rf\b"), "rm -rf is blocked by repository policy."),
    (
        re.compile(r"\bgit\s+push\b.*\s--force(?:-with-lease)?\b"),
        "Force-pushing is blocked by repository policy.",
    ),
    (
        re.compile(r"\bgit\s+reset\s+--hard\b"),
        "git reset --hard is blocked by repository policy.",
    ),
    (
        re.compile(r"\bDROP\s+TABLE\b", re.IGNORECASE),
        "DROP TABLE is blocked by repository policy.",
    ),
]


def _load_input() -> dict:
    raw = sys.stdin.read()
    if not raw.strip():
        return {}
    return json.loads(raw)


def _deny(reason: str) -> None:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }))


def main() -> int:
    payload = _load_input()
    command = payload.get("tool_input", {}).get("command", "")

    if not isinstance(command, str):
        return 0

    for pattern, reason in BLOCKED_PATTERNS:
        if pattern.search(command):
            _deny(reason)
            return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
