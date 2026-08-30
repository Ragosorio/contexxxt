---
name: contexxxt-core-development
description: "Use for non-trivial changes to contexxxt core commands, Project Model contracts, Query Layer, resolver, providers, learning, skills, or evals. Route the task through contexxxt resolve, scoped retrieval, verification, and structured observation."
---

# contexxxt-core-development

Use the project's public contexxxt commands so the Project Model remains the source of truth. Load detailed KnowledgeUnits or raw Evidence only when the compact result leaves a decision-relevant gap.

## Workflow

1. Run contexxxt resolve for the target and human intent, then inspect only unresolved decision-relevant gaps.
2. Implement the smallest coherent change while respecting the packet constraints and source authority.
3. Run deterministic verification from the packet and capture an ExecutionObservation without transcript or secrets.

## Verification

- Run the relevant focused tests and pnpm check before closing a core phase gate.
- Confirm generated artifacts are no-clobber and the Project Model did not change silently.

## Contract

- Prefer `contexxxt resolve --target <target> --intent <intent>` before non-trivial work.
- Follow the packet's constraints, decisions, unknowns and verification requirements.
- Record structured verification through `contexxxt observe ingest`; do not store raw transcripts or secret values.
- Treat this bundle as compiled routing/workflow, not canonical project knowledge.
