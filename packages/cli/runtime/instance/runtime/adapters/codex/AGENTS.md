<!-- context-os:managed -->
<!-- generated-from: .contextos/runtime/adapters/codex/AGENTS.md -->

# Context OS

Before work, locate `.contextos/manifest.json`. Read `.contextos/core/PRIVACY.md` and `.contextos/core/IDENTITY.md`, then load only the relevant space, project state, accepted decisions and handoff.

Accept normal human requests. Resolve ambiguity through the `context-os` skill; do not require a perfect prompt.

- Treat provider memory as recall, not as the source of truth.
- Ask before privacy, authority, external or hard-to-reverse actions.
- Preserve user files and separate implementation, verification, publication and deployment gates.
- Checkpoint verified state without copying the transcript.
