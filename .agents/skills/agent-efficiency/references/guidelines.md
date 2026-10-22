# Agent Efficiency: In-Depth Optimization Guidelines

This reference document expands upon the core principles in `SKILL.md` with concrete patterns and decision trees.

---

## 1. Progressive Context Loading Decision Tree

```
Need to inspect or modify code?
│
├── Know the exact file and approximate location?
│   └── YES: Use `view_file` with `StartLine` and `EndLine` targeting ±30 lines of interest.
│
├── Know the symbol/function/string name, but not the file?
│   └── YES: Use `grep_search` with specific query and `Includes` filters (e.g. `*.jsx`, `*.ts`).
│
├── Exploring directory structure?
│   └── YES: Use `list_dir` on the immediate parent directory. Never list root recursively if avoidable.
│
└── Need related types, caller signatures, or configurations?
    └── YES: Read only the imports block and definition site. Stop once contract is confirmed.
```

### Heuristics for File Viewing
- Avoid reading entire files > 100 lines unless understanding full control flow is mandatory.
- Use line bounds: e.g., viewing lines 30–75 when the error points to line 52.
- If viewing logs or output, examine the tail or use grep rather than reading whole multi-megabyte files.

---

## 2. Tool Invocation Efficiency

### Ripgrep (`grep_search`)
- Always specify `SearchPath` to the narrowest sensible directory (e.g. `/src` instead of project root).
- Use `Includes` to restrict searches by extension (`['*.ts', '*.tsx']`) to eliminate searching build artifacts, locks, or minified bundles.
- Set `MatchPerLine: true` when line contents are required; use `MatchPerLine: false` when only finding filenames.

### File Modifications
- Prefer `replace_file_content` for atomic single-block edits. Ensure `StartLine` and `EndLine` cleanly bound the replacement.
- Use `multi_replace_file_content` when making multiple related changes in the same file to save turns.
- Never use `write_to_file` to overwrite existing files unless performing a complete rebuild intentionally.

### Terminal Commands
- Run commands with precise targets (e.g. specific test files or specific linter rules).
- Limit verbose logging where possible (e.g. `npm run build` or targeted unit test runner).
- Avoid running polling loops; Antigravity's task system wakes up automatically on background task events.

---

## 3. Task Complexity Calibration

| Task Complexity | Typical Scenarios | Recommended Reasoning & Strategy |
| :--- | :--- | :--- |
| **Low** | Syntax errors, typos, single-line configuration, small bug fixes | Immediate pinpointing via error line number, targeted inspection (20-40 lines), single-pass edit, rapid verification. |
| **Medium** | New component, API endpoint addition, straightforward refactoring | Inspect interface contracts, define clear data flows, write modular additions, run unit/integration tests. |
| **High** | Authentication, concurrency, database migrations, security, major architectural changes | Thorough dependency audits, trace all call sites, review potential race conditions and edge cases, full test suite validation. |

---

## 4. Communication & Presentation Heuristics

1. **Be Concise:** Summarize the core problem and exact fix in 2–4 sentences.
2. **Actionable Links:** Always reference modified files with clickable markdown links (e.g. `[App.jsx](file:///path/to/App.jsx#L50-L60)`).
3. **No Unneeded Code Dumps:** Show only diffs or the immediate lines changed; do not paste back hundreds of unchanged lines.
4. **Transparent Status:** State whether the issue is resolved or if further user action (e.g. server restart, credentials) is required.

---

## 5. Model Tier Routing & Subagent Coordination

### Task Routing Matrix

| Task Category | Recommended Tier / Agent | Rationale |
| :--- | :--- | :--- |
| **Direct Simple** (typos, single line fixes, quick config) | Primary Agent (direct) | Overhead of spawning subagent exceeds execution cost. |
| **Isolated Routine** (CSS tweaks, documentation, small test suite, file searches) | `flash-worker` (`model: flash`) | Low token cost, high speed, sandboxed execution. |
| **Complex Engineering** (concurrency, race conditions, architecture, security, deep bugs) | `pro-worker` (`model: pro`) | High reasoning density required; prioritizes correctness over token thrift. |
| **Escalated Blockers** (repeated failures, unexpected regression, cross-system impact) | `pro-worker` (`model: pro`) | Stop churning on low-tier models; escalate with full checkpoint. |

### Escalation Checkpoint Template
When escalating from `flash-worker` or direct execution to `pro-worker`, pass this structured context:

```markdown
### Escalation Context
- **Objective:** <original task goal>
- **Findings So Far:** <validated paths, observed behaviors>
- **Attempted Approaches:** <what was tried and why it failed>
- **Target Files:** <clickable file links and line ranges>
- **Core Blocker:** <the specific obstacle requiring deeper reasoning>
```

