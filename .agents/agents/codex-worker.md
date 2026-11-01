# Codex task routing

This file is instruction guidance for the Codex orchestrator, not an automatically registered agent or a native model configuration. Read it through the workspace `AGENTS.md`. It does not change the main chat's model.

## Decide whether to delegate

Complete small, localized tasks directly when handing them off would cost more time or context than it saves. For larger tasks, delegate independent investigation, bounded implementation, or review while the primary agent handles integration and final verification. Do not delegate merely to use another model.

The workspace requests this selective use of subagents. Follow session permissions and tool availability; never assume every client exposes the same controls.

## Select a supported model

Use the runtime's advertised model list as the source of truth. These are preferred mappings for this environment, not guaranteed aliases in other clients:

| Work | Preferred model | Reasoning effort |
| --- | --- | --- |
| Bounded searches, documentation, simple CSS, routine edits | `gpt-6-luna` | `low` for mechanical work; `medium` for investigation |
| Implementation across files, ordinary debugging, meaningful code review | `gpt-6.1-sol` | `medium` |
| Difficult debugging, architecture, security, concurrency, complex algorithms | `gpt-6-astra` | `high` |

If a preferred model is unavailable, use an advertised suitable model or inherit the parent model. Do not guess model IDs or translate `flash` and `pro` into runtime model names. Increase effort only when uncertainty and risk warrant it; stronger models are not a substitute for evidence.

When the collaboration tool supports explicit model selection, spawn with `fork_turns: "none"` and supply a compact, self-contained task. This runtime does not allow model or reasoning overrides with a full-history fork. Use a full-history fork only when the existing conversation is necessary, and inherit the parent model and effort in that case. If another client lacks model selection, keep the routing roles and report the limitation honestly.

## Give each worker a bounded task

Include:

- Objective, acceptance criteria, and relevant user constraints.
- Exact files or directories to inspect or edit, and whether the task is read-only.
- Verified findings and the minimum context needed to act independently.
- Relevant workspace and skill instructions, plus the appropriate verification command when known.
- A request to report findings, files changed, checks actually run, and unresolved risks.

Assign disjoint file ownership to parallel writers. All agents share the workspace: do not overwrite another agent's edits, revert user changes, or duplicate an investigation already underway. Keep dependencies sequential and respect the runtime's concurrency limit. For this environment, normally use at most two workers alongside the primary; use the remaining available slot only for clearly independent work.

## Execute and verify

- Use `rg` / `rg --files` for targeted discovery and `Get-Content` with bounded ranges when inspecting large files in PowerShell.
- Use `apply_patch` for focused edits. Antigravity tools such as `view_file` and `replace_file_content` are examples from another environment, not required Codex tool names.
- Batch independent reads or searches; keep edits, dependent operations, approvals, and adaptive follow-ups sequential.
- Run checks that demonstrate the requested behavior. Do not add tests that simply mirror a trivial change, and never invent passing results.
- If an investigation stalls or reveals materially greater risk, return a compact checkpoint and let the orchestrator escalate once with the accumulated evidence. Avoid repeating failed attempts or bouncing work between agents.
- The primary agent reviews delegated changes, resolves integration issues, runs the necessary final checks, and gives one concise user-facing result. A worker's report alone is not proof that the combined change works.

## Keep Antigravity separate

Leave `flash-worker.md`, `pro-worker.md`, and the shared efficiency skill intact. Their `model: flash` / `model: pro` frontmatter does not configure Codex. This file supplies the Codex-specific routing without modifying those profiles.
