# Provider adapters

The `.contextos/` core is canonical. Provider memory is not synchronized automatically.

## Codex

Use short root `AGENTS.md`, `.agents/skills/context-os/` and optional `.codex/agents/`. Required rules stay versioned. Verify that Codex starts from the primary project root.

## ChatGPT

Keep global instructions minimal. Use a Project for shared chats, files and instructions. Apply exports manually; never claim account settings were changed.

## Claude Code

Use short `CLAUDE.md`, path rules only for real differences, `.claude/skills/context-os/` and optional agents. Auto memory is a recall layer local to the environment.

## Claude Chat and Cowork

Use profile/global instructions only for universal preferences. Keep project or folder context isolated. Local Claude Code skills do not imply Cowork availability.

Detect capabilities and cite current official documentation when a setting or UI may have changed.
