#!/usr/bin/env python3
"""Run lightweight repository checks before Codex stops."""

import importlib.util
import json
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def _run(cmd):
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)


def _block(reason: str) -> None:
    print(json.dumps({
        "decision": "block",
        "reason": reason,
    }))


def _ok(message: str) -> None:
    print(json.dumps({
        "systemMessage": message,
    }))


def main() -> int:
    checks = [
        ["python3", "-m", "json.tool", ".codex/hooks.json"],
        ["python3", "-m", "py_compile", "scripts/execute.py", "scripts/test_execute.py"],
    ]

    if importlib.util.find_spec("pytest") is not None:
        checks.append(["python3", "-m", "pytest", "scripts/test_execute.py"])

    failures = []
    for cmd in checks:
        result = _run(cmd)
        if result.returncode != 0:
            output = (result.stderr or result.stdout).strip()
            failures.append(f"$ {' '.join(cmd)}\n{output[:2000]}")

    if failures:
        _block("Stop validation failed. Fix these checks before finishing:\n\n" + "\n\n".join(failures))
        return 0

    if importlib.util.find_spec("pytest") is None:
        _ok("Stop validation passed: hooks JSON and Python syntax are valid. pytest is not installed, so tests were skipped.")
    else:
        _ok("Stop validation passed: hooks JSON, Python syntax, and pytest checks are valid.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
