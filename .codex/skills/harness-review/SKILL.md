---
name: harness-review
description: Review Harness project changes against repository architecture, ADR technology choices, tests, CRITICAL rules, lint, and build checks. Use when the user asks to review changes, validate a Harness step result, audit implementation quality, or produce a checklist-style project review.
---

# Harness Review

## Overview

Use this workflow to review changed files in a Harness project and report concrete violations against the project documents and executable checks.

## Preparation

Read these files first:

- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/ADR.md`

Then inspect changed files with Git, including staged and unstaged changes. Read the modified files before making claims about behavior.

## Checklist

Validate:

1. Architecture compliance: Does the change follow the directory structure and module boundaries in `ARCHITECTURE.md`?
2. Technology stack compliance: Does the change stay within ADR-defined technology choices?
3. Test coverage: Are tests present for new behavior, especially for new features required by `AGENTS.md` TDD rules?
4. CRITICAL rules: Does the change violate any CRITICAL rule in `AGENTS.md`?
5. Build readiness: Do the repository checks pass?

Run the relevant commands when feasible:

```bash
npm run lint
npm run build
npm run test
```

If a command cannot be run, state the reason and mark the build or test item as not verified instead of guessing.

## Output Format

Lead with findings when reviewing code. Use file and line references for concrete issues. Then provide the checklist table.

| Item | Result | Notes |
| --- | --- | --- |
| Architecture compliance | PASS/FAIL/NOT VERIFIED | {details} |
| Technology stack compliance | PASS/FAIL/NOT VERIFIED | {details} |
| Test coverage | PASS/FAIL/NOT VERIFIED | {details} |
| CRITICAL rules | PASS/FAIL/NOT VERIFIED | {details} |
| Build readiness | PASS/FAIL/NOT VERIFIED | {details} |

For violations, include a specific remediation path. Keep the summary secondary to the findings.
