# examples/

Placeholder. This directory will hold end-to-end fixture walkthroughs:

- `s1-complex-goal/` — full event log + artifact set for Scenario S1 (complex goal dispatch)
- `s2-ci-self-heal/` — Scenario S2 (CI failure self-heal)
- `s3-pm-report/` — Scenario S3 (PM weekly report)
- `s4-goal-change-approval/` — Scenario S4 (Goal change under human approval)

Each example will be a folder of JSON files — one per `ProjectEvent`, `ProjectArtifact`, and `ProjectProposal` — so implementers can replay them against their own server and check conformance.

Target milestone: **v0.2 alongside schemas/**.
