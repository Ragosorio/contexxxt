# Context OS repository guidance

Read `docs/PRODUCT.md`, `docs/DESIGN.md`, and `docs/ARCHITECTURE.md` before changing product behavior, visual language, or generated contracts.

## Working agreement

- Keep the public product neutral. Personal profiles, real accounts, local audits, private projects, transcripts, and credentials never belong in this repository.
- Accept normal human requests. Do not require a perfect prompt or a command vocabulary.
- Ask only when the answer changes privacy, authority, the artifact, or a hard-to-reverse action. Make reversible assumptions explicit.
- Treat provider memories as recall, not as the source of truth. Required rules live in versioned project files.
- Preserve user-owned files. Generated adapters must be idempotent, hash-aware, and no-clobber.
- Add a reproducible evaluation when routing, memory, security, or adapter behavior changes.
- Do not claim a provider capability, npm publication, deployment, or test result without current evidence.

## Verification

Run `pnpm check` for product changes. For UI changes, also verify keyboard behavior, reduced motion, 390 px layout, and the production build.
