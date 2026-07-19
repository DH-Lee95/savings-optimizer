---
name: harness-phase
description: Design Harness framework phase plans and step files for this repository. Use when the user asks to create, revise, or execute Harness phases, split implementation work into self-contained steps, generate phases/index.json or phases/{task-name}/stepN.md files, or explain scripts/execute.py execution and recovery.
---

# Harness Phase

## Overview

Use this workflow to turn a product or implementation goal into Harness phase metadata and independent step files. Keep each step small, self-contained, and directly verifiable by executable commands.

## Workflow

### 1. Explore

Read project context before planning:

- `AGENTS.md`
- `docs/PRD.md`
- `docs/ARCHITECTURE.md`
- `docs/ADR.md`
- Other relevant files under `docs/`

Use parallel file reads where practical. Capture architecture rules, critical constraints, required commands, and any existing phase files.

### 2. Discuss

If implementation details are ambiguous or require a technical decision, present the specific decision points and tradeoffs before writing phase files.

### 3. Design Steps

When the user asks for an implementation plan, draft multiple steps and ask for feedback before creating files unless the user already asked to write them.

Step design rules:

1. Keep scope minimal. One step should modify one layer or module where possible.
2. Make each step self-contained. Do not rely on prior conversation; include all required context in the step file.
3. Force preparation. List required docs and files from earlier steps so a fresh Codex session reads them first.
4. Specify interfaces at the signature level. Leave implementation details to the agent unless a rule is essential for idempotency, security, data integrity, or architecture.
5. Use executable acceptance criteria such as `npm run build && npm run test`.
6. Write concrete warnings in the form "Do not do X. Reason: Y."
7. Name steps with kebab-case slugs that describe the core module or task, such as `project-setup`, `api-layer`, or `auth-flow`.

## Files To Create

### `phases/index.json`

Create the top-level phase index. If it already exists, append a new entry to the `phases` array.

```json
{
  "phases": [
    {
      "dir": "0-mvp",
      "status": "pending"
    }
  ]
}
```

- `dir`: task directory name.
- `status`: one of `pending`, `completed`, `error`, or `blocked`.
- Do not add timestamps at creation time. `execute.py` records `completed_at`, `failed_at`, and `blocked_at`.

### `phases/{task-name}/index.json`

Create one task-level index per phase.

```json
{
  "project": "<project-name>",
  "phase": "<task-name>",
  "steps": [
    { "step": 0, "name": "project-setup", "status": "pending" },
    { "step": 1, "name": "core-types", "status": "pending" },
    { "step": 2, "name": "api-layer", "status": "pending" }
  ]
}
```

- `project`: project name from `AGENTS.md`.
- `phase`: task name, matching the directory name.
- `steps[].step`: zero-based step number.
- `steps[].name`: kebab-case slug.
- `steps[].status`: initial value `pending`.

Status fields:

| Transition | Fields | Writer |
| --- | --- | --- |
| to `completed` | `completed_at`, `summary` | Codex writes `summary`; `execute.py` writes timestamp |
| to `error` | `failed_at`, `error_message` | Codex writes message; `execute.py` writes timestamp |
| to `blocked` | `blocked_at`, `blocked_reason` | Codex writes reason; `execute.py` writes timestamp |

Do not add `created_at` or step-level `started_at`; `execute.py` records them.

### `phases/{task-name}/step{N}.md`

Create one step file per step:

````markdown
# Step {N}: {name}

## Files To Read

Read these files first to understand the architecture and design intent:

- `docs/ARCHITECTURE.md`
- `docs/ADR.md`
- {files created or modified by previous steps}

Carefully read code created by previous steps before editing.

## Task

{Specific implementation instructions. Include file paths, function/class signatures, and logic requirements. Keep snippets at interface or signature level unless implementation details are essential.}

## Acceptance Criteria

```bash
npm run build
npm test
```

## Verification

1. Run the acceptance criteria commands.
2. Check architecture:
   - Does the change follow `ARCHITECTURE.md` directory structure?
   - Does it stay within the ADR technology choices?
   - Does it comply with `AGENTS.md` CRITICAL rules?
3. Update `phases/{task-name}/index.json`:
   - Success: set status to `completed` and add a one-line `summary`.
   - Failure after 3 fix attempts: set status to `error` and add `error_message`.
   - User input required: set status to `blocked`, add `blocked_reason`, and stop.

## Do Not

- {Concrete prohibition. Use "Do not do X. Reason: Y."}
- Do not break existing tests.
````

## Execution

Run phases with:

```bash
python3 scripts/execute.py {task-name}
python3 scripts/execute.py {task-name} --push
```

`execute.py` handles:

- Creating or checking out `feat-{task-name}`
- Injecting guardrails from `AGENTS.md` and `docs/*.md`
- Passing completed step summaries into later steps
- Retrying failed steps up to 3 times with prior errors in context
- Creating separate code (`feat`) and metadata (`chore`) commits
- Recording timestamps such as `started_at`, `completed_at`, `failed_at`, and `blocked_at`

Recovery:

- For `error`, reset the step status to `pending`, remove `error_message`, then rerun.
- For `blocked`, resolve the blocker, reset status to `pending`, remove `blocked_reason`, then rerun.
