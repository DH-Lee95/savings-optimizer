#!/usr/bin/env python3
"""Repository PermissionRequest policy for Codex hooks."""

import json
import re
import sys


DENY_PATTERNS = [
    (re.compile(r"\brm\s+-rf\b"), "Escalated rm -rf is blocked by repository policy."),
    (
        re.compile(r"\bgit\s+push\b.*\s--force(?:-with-lease)?\b"),
        "Escalated force-push is blocked by repository policy.",
    ),
    (
        re.compile(r"\bgit\s+reset\s+--hard\b"),
        "Escalated git reset --hard is blocked by repository policy.",
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
            "hookEventName": "PermissionRequest",
            "decision": {
                "behavior": "deny",
                "message": reason,
            },
        }
    }))


def main() -> int:
    payload = _load_input()
    command = payload.get("tool_input", {}).get("command", "")

    if not isinstance(command, str):
        return 0

    for pattern, reason in DENY_PATTERNS:
        if pattern.search(command):
            _deny(reason)
            return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
