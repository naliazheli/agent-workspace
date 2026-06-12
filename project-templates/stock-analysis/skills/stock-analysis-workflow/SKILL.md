---
name: stock-analysis-workflow
description: Common workflow and output contracts for AgentCraft stock analysis projects.
---

# Stock Analysis Workflow

Use this skill for AgentCraft projects that coordinate recurring stock and
market analysis across specialist agents. The workflow is inspired by
multi-stage stock-analysis systems such as `daily_stock_analysis`, but it is a
portable AgentCraft project template and must not depend on a specific host
product or private code path.

## Boundaries

- Produce informational research, not financial advice.
- Never claim certainty, guaranteed returns, or personalized investment advice.
- Do not place trades, request brokerage credentials, or operate owner accounts.
- Keep source freshness visible. Every market, news, or sentiment claim should
  include the source name and observed timestamp or trading date when available.
- If paid data, search, or model credentials are missing, request project
  globals through owner resource work items instead of inventing data.
- Prefer deterministic public or owner-provided data before live web searches.
- Treat stale, partial, conflicting, or failed data as an explicit risk in the
  report rather than silently smoothing it over.

## Shared Folders

- `inputs/`: owner watchlists, portfolio context, and analysis preferences.
- `data/`: normalized quotes, bars, fundamentals, market context, and source
  notes by run id.
- `analysis/`: per-role intermediate analysis artifacts.
- `reports/`: final dashboards, per-symbol decision reports, and market reviews.
- `deliveries/`: notification-ready summaries and owner handoff packages.
- `reviews/`: reviewer findings and quality gates.
- `runs/`: durable run ledger and coordination notes.
- `archived/`: completed or superseded inputs and reports.

## Run Ids

Use a stable run id for each analysis cycle. Prefer `YYYY-MM-DD` for one daily
cycle, or `YYYY-MM-DD-<short-topic>` when the owner asks for an ad hoc run.

Write artifacts with predictable paths:

- `data/<run-id>/<symbol>-market-data.md`
- `analysis/<run-id>/<symbol>-technical.md`
- `analysis/<run-id>/<symbol>-intelligence.md`
- `analysis/<run-id>/<symbol>-risk.md`
- `reports/<run-id>/<symbol>-decision.md`
- `reports/<run-id>/dashboard.md`
- `deliveries/<run-id>/notification.md`
- `reviews/<run-id>/quality-review.md`

## Minimum Final Report Contract

Every owner-facing final report should include:

- disclaimer that the output is informational research, not financial advice
- run id, generation time, timezone, market scope, and data freshness summary
- watchlist symbols analyzed, skipped, and failed, with reasons
- per-symbol decision label such as bullish, neutral, bearish, watch, or avoid
- confidence level and the main reasons behind it
- technical picture: trend, price position, volume, support/resistance, momentum
- intelligence picture: news, announcements, catalysts, sentiment, unknowns
- risk picture: downside scenarios, invalidation points, liquidity/data risks
- action checklist framed as decision support, not instructions to trade
- source and artifact links back to project files used by the synthesis

## Handoff Rules

- Do not mark a work item complete until its promised project files exist.
- Verify output paths with project-file-list or project-file-read before handoff.
- A downstream role must read the upstream project files before synthesizing.
- If an upstream artifact is missing or stale, request revision instead of
  generating a final report from memory.
- Keep secrets out of project files, comments, report text, and logs.

## Lead Polling Loop

The stock-analysis lead should treat every fresh conversation and polling tick
as a run-frontier review.

1. Read `runs/stock-analysis-lead.md` if present, then project globals, active
   goals, linked work items, assignment/runtime state, recent events, targeted
   shared files, memory, and the run ledger.
2. Use `runs/stock-analysis-lead.md` as the stock-specific human-readable lead
   workspace and `runs/stock-analysis-ledger.jsonl` as the stock-specific lead ledger.
   Record one JSONL decision per inspected run or goal with the status digest,
   decision, next action, and created work item ids.
3. Skip a run only when the ledger digest is unchanged and there is no READY,
   NEEDS_REVISION, IN_REVIEW, failed assignment, owner resource item, or blocked
   dependency needing lead attention.
4. Leave READY and NEEDS_REVISION work items for the COORDINATOR unless the
   coordinator is disabled or stale.
5. Do not mark a goal complete until the final report path exists, is accepted,
   links back to accepted upstream artifacts, and discloses stale or missing
   data.
6. Before stopping, update `runs/stock-analysis-lead.md` with the run cursor,
   skipped reasons, next run/goal queue, unresolved blockers, and project-level
   stock-analysis decisions.

## Stock Analysis Aggregation Fan-Out/Fan-In

Use this lane structure for ordinary stock-analysis goals that need a combined decision or owner-facing report:

1. `MARKET_DATA_COLLECTION` establishes normalized data and source freshness.
2. `TECHNICAL_ANALYSIS` and `INTELLIGENCE_RESEARCH` run in parallel after data
   is available.
3. `RISK_REVIEW` runs after data and at least one analysis artifact are present.
4. `DECISION_SYNTHESIS` runs only after data, technical, intelligence, and risk
   artifacts are accepted or explicitly unavailable with reasons.
5. `DECISION_SYNTHESIS` and `REPORT_DELIVERY` work items must name accepted
   upstream work item ids in `dependsOn`, list every accepted upstream artifact
   in `inputPacket.projectFiles`, and include `inputPacket.acceptedUpstreamItems`
   with `{ workItemId, outputPaths }` so the assignee can open exact upstream
   details only when the file packet is insufficient.
6. `REPORT_DELIVERY` runs only after decision artifacts are accepted.
7. `REVIEW_AGENT` gates evidence and final reports before downstream synthesis
   or goal completion.
