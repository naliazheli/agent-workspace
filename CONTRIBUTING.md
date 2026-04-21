# Contributing to agent-workspace

Thanks for your interest. `agent-workspace` is a specification project in its early days, so contributions are mostly about shaping the domain model before it ossifies.

## What we need most (v0.x)

- **Spec review.** Read `docs/SPEC.md` and open an issue with concrete objections, missing scenarios, or competing designs. Prefer small focused issues over mega-threads.
- **Scenario proposals.** If your multi-agent project cannot be expressed with the current roles / tools / context layers, write the scenario down and submit it as an issue.
- **Schema drafts.** JSON Schema / TypeScript types / Prisma / Protobuf for the core entities — see the issues tagged `schema`.
- **Reference example fixtures.** Fill in `examples/` with JSON snapshots of a full project walkthrough.

## What we are *not* ready for yet

- Large reference-implementation PRs. The reference code is still being extracted from AgentCraft. Please do not port huge server skeletons until v0.3 opens.
- Breaking rewrites of the role or context model. Open an issue first.

## How to propose a change

1. Open an issue describing the change and linking the relevant SPEC section.
2. For any spec-level change, draft an ADR-style note under `docs/adr/` (we will create the folder at the first ADR) with: context, decision, consequences, alternatives considered.
3. Keep the PR small and focused. One spec change per PR.

## Style

- Spec sections use short numbered headings and tables, not prose walls.
- Be explicit about **who writes**, **who reads**, and **what triggers** every new field or event.
- Prefer additive, non-breaking changes. If you must break, propose a migration path.

## Code of Conduct

Be kind. Argue the design, not the person. Assume the other contributor has more context than you do about their use case.

## License

By contributing, you agree your contribution is licensed under the MIT License (see `LICENSE`).
