---
name: agent-efficiency
description: >-
  Provides operational strategies to minimize token usage, prevent redundant tool calls,
  and optimize execution speed across coding, debugging, and refactoring tasks without
  compromising code quality, debugging accuracy, or completeness. Activate this skill
  during software engineering, investigation, debugging, or multi-step development workflows.
---

# Agent Efficiency Guide

A practical operational framework to maximize execution speed, minimize redundant operations, and eliminate wasteful token consumption while upholding strict standards of code quality and correctness.

---

## Mandatory Quality Safeguards

> [!CRITICAL]
> **Correctness and reliability strictly override token savings.** Optimization means eliminating wasted effort—never eliminating essential investigation or verification.

1. **Never fabricate or assume:** Never fake test results, claim unverified code works, or guess file structures without inspecting them.
2. **Never truncate implementations:** Never emit partial snippets, `// TODO: rest of code`, or incomplete logic to conserve tokens. Write complete, functional code.
3. **No premature stops:** Expand investigation whenever context is insufficient or ambiguous.
4. **Preserve system integrity:** Never weaken security, error handling, or validation routines for the sake of brevity.
5. **Respect workspace conventions:** Preserve existing architecture, formatting, and docstrings unless explicit changes are requested.

---

## Core Operational Workflow

```
[Targeted Discovery] ──▶ [Bounded Inspection] ──▶ [Focused Execution] ──▶ [Targeted Verification]
   (find symbols/paths)     (read slices/ranges)    (minimal diff edits)     (run specific tests)
```

### 1. Progressive Context Loading
- **Never read entire directories or files blindly.** Use `list_dir` on specific subdirectories or `grep_search` with path filters (`Includes`) to find exact target symbols.
- **Slice before loading:** When inspecting files, use `StartLine` and `EndLine` in `view_file` to read relevant blocks (e.g., 40–80 lines around target symbols) instead of full 1,000+ line files.
- **Trace outwards only as needed:** Expand to imports, callers, or configuration only when required to confirm contracts or side effects.

### 2. Efficient Tool Usage
- **Zero duplicate actions:** Check previous tool results in the conversation before repeating any file read, search, or status check.
- **Narrow command output:** Avoid commands that output hundreds of lines. Use targeted flags (e.g., `git status -s`, `pytest tests/test_auth.py::test_login`, `npm test -- -t "auth"`).
- **Prefer single-pass edits:** Use `replace_file_content` for atomic blocks or `multi_replace_file_content` for multiple non-contiguous edits in one turn, avoiding round-trips.

### 3. Context & State Management
- **Maintain clear focus:** Track current objective, modified files, and remaining steps mentally or in concise status updates.
- **Prevent context pollution:** If a multi-hour session accumulates heavy unrelated history, recommend starting a fresh session for new tasks.
- **Checkpoint complex tasks:** When executing multi-step tasks, summarize milestones in 1–2 sentences rather than re-listing entire file contents.

### 4. Task-Adaptive Reasoning
- **Calibrate effort:**
  - *Low risk / straightforward:* (e.g., typos, simple styling, single-line bug fixes) -> Rapid targeted inspection, immediate edit, quick validation.
  - *High risk / architectural:* (e.g., database schemas, security flows, concurrency, unfamiliar dependencies) -> Thorough dependency checks, defensive reasoning, and comprehensive validation.
- Do not suppress reasoning where subtle edge cases exist.

### 5. Minimal, Targeted Code Changes
- Edit surgical lines rather than rewriting entire files or large functions.
- Avoid introducing unnecessary dependencies, wrapper layers, or unsolicited refactors.
- Verify existing imports and package versions before adding new libraries.

### 6. Targeted Verification
- Execute specific unit/integration tests directly addressing the changed code first.
- If a test fails, diagnose the root cause from the error trace before rerunning commands blindly.
- Validate builds/lints cleanly before concluding.

### 7. Efficient Communication
- Communicate solutions, actions taken, and verification results concisely in GitHub-flavored markdown.
- Use clickable file links (e.g., `[server.js](file:///path/to/server.js#L14)`).
- Avoid regurgitating unchanged code or entire terminal transcripts in chat responses.

---

## Intelligent Model & Subagent Routing

The primary agent coordinates work. Before delegating, evaluate **complexity, risk, uncertainty, required context, and delegation overhead**. Do not delegate when direct execution is faster.

```
Incoming Task Assessment
   │
   ├── Simple / Localized / Low Risk?
   │   ├── Zero overhead preferred ──▶ Direct Primary Execution
   │   └── Task isolation beneficial ─▶ Delegate to `flash-worker` (model: flash)
   │
   ├── Moderate Complexity?
   │   └── Primary Agent or `flash-worker` (escalate if complexity grows)
   │
   └── High Complexity / Architecture / Security / Concurrency?
       └── Delegate to `pro-worker` (model: pro)
```

### Subagent Tier Profiles
- **`flash-worker` (`model: flash`):**
  - Best for: CSS/UI adjustments, simple bug fixes, boilerplate tests, documentation, file search/navigation.
  - Goal: Rapid execution, minimum token cost, surgical edits.
- **`pro-worker` (`model: pro`):**
  - Best for: Deep debugging, race conditions, architecture/design decisions, security-critical changes, complex refactoring.
  - Goal: Rigorous correctness, thorough verification, comprehensive reasoning.

### Automatic Escalation Policy
- **Triggers:** Escalate from `flash-worker` / direct execution to `pro-worker` when:
  1. A bug requires deeper architectural analysis than initially anticipated.
  2. An edit touches critical security, auth, concurrency, or core data schemas.
  3. Repeated attempts fail to make meaningful progress.
- **Protocol:** Never ping-pong back and forth between workers. Package a compact checkpoint containing:
  - Validated findings so far
  - Attempted solutions and failure modes
  - Target files and code locations
  - Core unresolved question/issue

---

## Detailed References

For comprehensive optimization heuristics, reference patterns, and checklists:
- [Detailed Optimization Guidelines](./references/guidelines.md)

