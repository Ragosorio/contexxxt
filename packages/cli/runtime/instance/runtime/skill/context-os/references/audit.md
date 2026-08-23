# Audit

Audit is read-only unless the user separately authorizes a report file.

## Inventory

- instruction surfaces and scope;
- memory stores and whether they are native or canonical;
- project state, decisions and handoffs;
- tools/skills available versus used;
- source authority, verification and expiry;
- account, surface and sensitivity boundaries.

## Findings

Use evidence and severity:

- P0: exposed secret or active cross-account leakage;
- P1: false durable premise, unsafe authority or blocking contradiction;
- P2: stale source, duplicate rule, drift or excessive context;
- P3: clarity, naming or maintenance improvement.

Never echo a possible secret. Name the file and remediation boundary only.

For every finding provide evidence, impact, minimal correction, required authorization and verification gate.
