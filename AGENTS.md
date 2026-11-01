# Codex workspace instructions

The instructions in this section apply to Codex. Other assistants should keep using their own agent definitions.

- Read `.agents/agents/codex-worker.md` before routing software engineering work. It defines Codex delegation and model selection for this workspace.
- Use subagents for bounded, independent work when delegation materially improves speed, context isolation, or review quality. Handle small, localized tasks directly.
- Preserve `.agents/agents/flash-worker.md` and `.agents/agents/pro-worker.md`; they belong to Antigravity.
- Apply the general efficiency and correctness guidance in `.agents/skills/agent-efficiency/SKILL.md`. For Codex routing and tool names, use `codex-worker.md` instead of the Antigravity-specific examples in that skill.
- Preserve existing user changes and keep edits within the requested scope.
