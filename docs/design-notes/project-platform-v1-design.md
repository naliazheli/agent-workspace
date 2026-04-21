# AIFactory Project Platform V1 Design

## 1. Background

The current AIFactory product is centered around the marketplace flow:

- `Task`
- `Submission`
- `Review`
- `AgentSession`

That model works for isolated bounty work, but it is not enough for project-level multi-agent collaboration.

The new design introduces a separate "project platform" product line for:

- project creation and planning
- goal and feature decomposition
- multi-agent assignment and reassignment
- structured context sharing
- staged delivery and acceptance
- long-running coordination instead of one-off task submission

This version is intentionally isolated from the legacy marketplace.

## 2. Core Decision

### 2.1 Product strategy

Ship the new system as a separate tab in the UI, for example:

- `Marketplace` for the legacy task flow
- `Projects` for the new project platform

The new tab should have its own routes, APIs, tables, and state management.

### 2.2 Data strategy

Do not couple the new system to legacy tables such as:

- `tasks`
- `submissions`
- `comments`
- `agent_sessions`
- `agent_stats`

The new project platform may reuse only shared base entities such as:

- `users`
- `api_configs`

Everything else should use new tables prefixed with `project_`.

### 2.3 Why isolate V1

Isolation gives us:

- low migration risk
- freedom to design a better domain model
- easier internal testing
- a clean cutover path when the new system is mature

The goal is not "upgrade task". The goal is "introduce a project operating system".

## 3. Product Goals

The new project platform should support:

1. A human or lead agent creates a project.
2. The lead agent can write goals directly or derive them from a demand brief.
3. Goals can be decomposed into features and work items.
4. Multiple agents can be hired into the same project with different roles.
5. Agents do not receive the full raw history by default.
6. Each assignment gets a scoped task packet and a structured handoff contract.
7. Delivery is accepted through explicit review gates.
8. Shared project memory is updated as facts and decisions change.

## 4. Non-Goals For V1

V1 should not try to do all of the following:

- merge with the legacy marketplace data model
- support external billing settlement beyond simple internal accounting
- build a fully autonomous agent company with no human override
- expose every orchestration primitive through MCP on day one
- support every artifact type from the start

V1 should first make project coordination reliable.

## 5. Domain Model

The new system should use the following domain layers:

### 5.1 Project

The top-level collaboration container.

Holds:

- project brief
- status
- owner
- budget
- default rules
- shared context

### 5.2 Goal

A goal is a project-level target that explains what outcome the project is trying to achieve.

Examples:

- launch GitHub OAuth login
- build an internal review agent
- ship a cloud worker runtime

### 5.3 Feature

A feature is a deliverable capability under a goal.

Examples:

- GitHub OAuth callback handling
- account linking UI
- token refresh flow

### 5.4 Work Item

A work item is the execution unit assigned to one agent or a small set of agents.

Unlike legacy `Task`, a work item is internal to a project and may represent:

- research
- design
- implementation
- review
- integration
- verification
- rollout

### 5.5 Assignment

An assignment represents the relationship between an agent and a work item.

It answers:

- who is working
- in what role
- with what scope
- under what status
- with what context packet

### 5.6 Run

A run is one execution attempt under an assignment.

It records:

- prompt or instruction snapshot
- selected context snapshot
- logs
- tool traces or external references
- result summary
- cost and token stats

### 5.7 Artifact

An artifact is a structured deliverable produced by an agent.

Examples:

- implementation note
- design proposal
- PR URL
- patch bundle
- test report
- verification report

### 5.8 Review Gate

A review gate is an explicit acceptance checkpoint.

Reviewers may be:

- project owner
- lead agent
- review agent
- human reviewer
- rule-based validator

### 5.9 Memory

Project memory stores structured facts instead of raw transcript only.

Examples:

- decisions
- constraints
- interface contracts
- resolved questions
- known risks

## 6. Context Sharing Model

This is the most important architecture rule in the new system.

Do not share one giant project conversation with every agent.

Use four levels of context:

### 6.1 Project Brief

Stable context that most project participants can see:

- business goal
- scope
- stack
- constraints
- owner expectations

### 6.2 Shared Memory

Structured facts that evolve over time:

- decisions
- assumptions
- dependencies
- open risks

### 6.3 Task Packet

Assignment-scoped context prepared for one work item:

- objective
- acceptance criteria
- related files or links
- relevant decisions
- dependencies
- output contract

### 6.4 Handoff Package

Required structured output from an assignment:

- what was done
- what changed
- what remains
- blockers
- risks
- recommended next step

This model keeps context small, auditable, and reusable.

## 7. Roles

V1 should support these roles:

- `OWNER`: human project owner
- `LEAD_AGENT`: the main coordinating agent
- `WORKER_AGENT`: execution agent
- `REVIEW_AGENT`: acceptance or verification agent
- `OBSERVER`: read-only participant

Notes:

- one project can have one owner and one lead agent at minimum
- a lead agent can hire and release worker agents
- firing an agent should end assignments, not delete history

## 8. Lifecycle And Status Model

### 8.1 Project status

```text
DRAFT -> ACTIVE -> PAUSED -> COMPLETED
                    \-> ARCHIVED
```

Recommended enum:

```prisma
enum ProjectStatus {
  DRAFT
  ACTIVE
  PAUSED
  COMPLETED
  ARCHIVED
}
```

### 8.2 Goal status

```prisma
enum ProjectGoalStatus {
  OPEN
  IN_PROGRESS
  BLOCKED
  DONE
  CANCELLED
}
```

### 8.3 Feature status

```prisma
enum ProjectFeatureStatus {
  PLANNED
  READY
  IN_PROGRESS
  BLOCKED
  DONE
  CANCELLED
}
```

### 8.4 Work item status

```prisma
enum ProjectWorkItemStatus {
  DRAFT
  READY
  ASSIGNED
  IN_PROGRESS
  IN_REVIEW
  NEEDS_REVISION
  ACCEPTED
  REJECTED
  CANCELLED
}
```

### 8.5 Assignment status

```prisma
enum ProjectAssignmentStatus {
  PROPOSED
  ACTIVE
  PAUSED
  COMPLETED
  RELEASED
  FAILED
}
```

### 8.6 Run status

```prisma
enum ProjectRunStatus {
  QUEUED
  RUNNING
  SUCCEEDED
  FAILED
  CANCELLED
}
```

### 8.7 Review status

```prisma
enum ProjectReviewStatus {
  PENDING
  APPROVED
  CHANGES_REQUESTED
  REJECTED
}
```

## 9. Database Design

V1 should use separate tables with `project_` prefixes.

### 9.1 `projects`

Top-level project record.

Suggested fields:

```prisma
model Project {
  id                String        @id @default(uuid())
  name              String
  slug              String        @unique @db.VarChar(191)
  summary           String?       @db.Text
  brief             String?       @db.Text
  status            ProjectStatus @default(DRAFT)
  visibility        String        @default("private")
  ownerId           String
  leadAgentUserId   String?
  budgetAmount      Float         @default(0)
  budgetCurrency    String        @default("AIC")
  settings          Json?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
}
```

Notes:

- `leadAgentUserId` points to the main coordinating agent account
- `settings` stores runtime flags for autonomy and review rules

### 9.2 `project_members`

Project-level membership and role table.

```prisma
model ProjectMember {
  id          String   @id @default(uuid())
  projectId   String
  userId      String
  role        String   @db.VarChar(50)
  permissions Json?
  joinedAt    DateTime @default(now())
  removedAt   DateTime?

  @@unique([projectId, userId, role])
}
```

Why separate from assignments:

- membership means "part of the project"
- assignment means "working on this work item now"

### 9.3 `project_goals`

```prisma
model ProjectGoal {
  id           String            @id @default(uuid())
  projectId    String
  title        String
  description  String?           @db.Text
  priority     Int               @default(0)
  status       ProjectGoalStatus @default(OPEN)
  sortOrder    Int               @default(0)
  createdById  String
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt
}
```

### 9.4 `project_features`

```prisma
model ProjectFeature {
  id           String               @id @default(uuid())
  projectId    String
  goalId       String?
  title        String
  description  String?              @db.Text
  status       ProjectFeatureStatus @default(PLANNED)
  priority     Int                  @default(0)
  sortOrder    Int                  @default(0)
  spec         Json?
  createdById  String
  createdAt    DateTime             @default(now())
  updatedAt    DateTime             @updatedAt
}
```

### 9.5 `project_work_items`

This is the core execution table.

```prisma
model ProjectWorkItem {
  id                  String                @id @default(uuid())
  projectId           String
  goalId              String?
  featureId           String?
  parentWorkItemId    String?
  title               String
  description         String?               @db.Text
  workType            String                @db.VarChar(50)
  status              ProjectWorkItemStatus @default(DRAFT)
  priority            Int                   @default(0)
  scopeBrief          String?               @db.Text
  acceptanceCriteria  String?               @db.Text
  inputPacket         Json?
  outputContract      Json?
  dependsOn           Json?                 // array of work item ids
  createdById         String
  ownerId             String?
  dueAt               DateTime?
  createdAt           DateTime              @default(now())
  updatedAt           DateTime              @updatedAt
}
```

Important differences from legacy `Task`:

- internal project unit, not public marketplace posting
- can represent non-coding work
- carries assignment packet and output contract directly

### 9.6 `project_assignments`

```prisma
model ProjectAssignment {
  id                String                  @id @default(uuid())
  projectId         String
  workItemId        String
  assigneeUserId    String
  assignedByUserId  String
  role              String                  @db.VarChar(50)
  status            ProjectAssignmentStatus @default(PROPOSED)
  objective         String?                 @db.Text
  contextPacket     Json?
  startedAt         DateTime?
  finishedAt        DateTime?
  createdAt         DateTime                @default(now())
  updatedAt         DateTime                @updatedAt
}
```

This table is the real implementation of "hire" and "release".

- hire agent: create or activate assignment
- release agent: set assignment status to `RELEASED`
- pause agent: set assignment status to `PAUSED`

### 9.7 `project_runs`

Each assignment can have multiple execution attempts.

```prisma
model ProjectRun {
  id                String           @id @default(uuid())
  projectId         String
  workItemId        String
  assignmentId      String?
  triggeredByUserId String?
  runType           String           @db.VarChar(50)
  status            ProjectRunStatus @default(QUEUED)
  instruction       String?          @db.Text
  contextSnapshot   Json?
  resultSummary     String?          @db.Text
  costInfo          Json?
  startedAt         DateTime?
  finishedAt        DateTime?
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt
}
```

This is the project-platform replacement for the old `AgentSession`.

### 9.8 `project_run_logs`

```prisma
model ProjectRunLog {
  id        String   @id @default(uuid())
  runId     String
  level     String   @default("info")
  message   String   @db.Text
  metadata  Json?
  createdAt DateTime @default(now())
}
```

### 9.9 `project_artifacts`

```prisma
model ProjectArtifact {
  id              String   @id @default(uuid())
  projectId       String
  workItemId      String?
  assignmentId    String?
  runId           String?
  artifactType    String   @db.VarChar(50)
  title           String?
  content         String?  @db.Text
  url             String?  @db.VarChar(1000)
  metadata        Json?
  createdByUserId String
  createdAt       DateTime @default(now())
}
```

Artifact examples:

- `DESIGN_NOTE`
- `HANDOFF`
- `PATCH`
- `PR_LINK`
- `TEST_REPORT`
- `DECISION_RECORD`

### 9.10 `project_reviews`

```prisma
model ProjectReview {
  id                String              @id @default(uuid())
  projectId         String
  workItemId        String
  assignmentId      String?
  artifactId        String?
  reviewerUserId    String?
  reviewerType      String              @db.VarChar(50)
  status            ProjectReviewStatus @default(PENDING)
  reviewNote        String?             @db.Text
  checklistResult   Json?
  createdAt         DateTime            @default(now())
  updatedAt         DateTime            @updatedAt
}
```

### 9.11 `project_memories`

```prisma
model ProjectMemory {
  id              String   @id @default(uuid())
  projectId       String
  memoryType      String   @db.VarChar(50)
  title           String?
  content         String   @db.Text
  summary         String?  @db.Text
  metadata        Json?
  sourceArtifactId String?
  createdByUserId String
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

Recommended `memoryType` values:

- `DECISION`
- `CONSTRAINT`
- `FACT`
- `RISK`
- `OPEN_QUESTION`
- `INTERFACE_CONTRACT`

### 9.12 Optional V1.1 tables

These can wait until after the first usable version:

- `project_comments`
- `project_notifications`
- `project_templates`
- `project_dependency_edges`
- `project_cost_ledgers`

## 10. Main Workflow

### 10.1 Create project

1. Human creates project.
2. Human writes a brief or asks lead agent to derive one.
3. System creates `projects` record.
4. Lead agent is attached as a `project_member`.

### 10.2 Planning

1. Lead agent generates `goals`.
2. Lead agent generates `features`.
3. Lead agent creates initial `work_items`.
4. Important decisions are written into `project_memories`.

### 10.3 Hiring agents

1. Lead agent chooses a worker agent for a work item.
2. System creates `project_assignment`.
3. Assignment gets a scoped `contextPacket`.
4. Worker starts one or more `project_runs`.

### 10.4 Delivery

1. Worker produces one or more `project_artifacts`.
2. Worker publishes a structured handoff artifact.
3. Work item moves to `IN_REVIEW`.

### 10.5 Acceptance

1. Reviewer creates `project_review`.
2. If approved, work item becomes `ACCEPTED`.
3. If not approved, work item becomes `NEEDS_REVISION` or `REJECTED`.
4. Key accepted knowledge is copied into `project_memories`.

### 10.6 Release or reassign

If a worker is no longer needed:

- set assignment to `RELEASED`
- keep runs and artifacts
- optionally create a new assignment for another agent

Do not delete delivery history.

## 11. Hire And Fire Semantics

The project platform should model hiring and firing explicitly.

### 11.1 Hire

"Hire" means:

- add a `project_member` if needed
- create a `project_assignment`
- issue a context packet
- optionally set resource limits and review policy

### 11.2 Fire

"Fire" should not mean deleting the agent from history.

It should mean:

- pause or release active assignments
- revoke future dispatch permission
- preserve all past runs, logs, and artifacts

Suggested statuses:

- `PAUSED`: temporarily stopped
- `RELEASED`: removed from current work
- `FAILED`: run or assignment failed operationally

## 12. Acceptance Rules

The new platform should make acceptance explicit and auditable.

Each work item should support:

- acceptance criteria text
- output contract
- review checklist
- reviewer type
- final acceptance result

Minimum V1 acceptance checklist:

1. Does the result satisfy the objective.
2. Is the evidence attached.
3. Are blockers or risks documented.
4. Does shared memory need to be updated.
5. Does this unlock dependent work items.

## 13. API Design Sketch

Namespace suggestion:

- `/api/projects`

### 13.1 Project APIs

- `POST /api/projects`
- `GET /api/projects`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`
- `POST /api/projects/:id/activate`
- `POST /api/projects/:id/pause`
- `POST /api/projects/:id/archive`

### 13.2 Goal and feature APIs

- `POST /api/projects/:id/goals`
- `GET /api/projects/:id/goals`
- `POST /api/projects/:id/features`
- `GET /api/projects/:id/features`

### 13.3 Work item APIs

- `POST /api/projects/:id/work-items`
- `GET /api/projects/:id/work-items`
- `GET /api/projects/:id/work-items/:workItemId`
- `PATCH /api/projects/:id/work-items/:workItemId`
- `POST /api/projects/:id/work-items/:workItemId/ready`
- `POST /api/projects/:id/work-items/:workItemId/review`

### 13.4 Assignment APIs

- `POST /api/projects/:id/work-items/:workItemId/assignments`
- `POST /api/projects/:id/assignments/:assignmentId/pause`
- `POST /api/projects/:id/assignments/:assignmentId/release`
- `POST /api/projects/:id/assignments/:assignmentId/restart`

### 13.5 Run and artifact APIs

- `POST /api/projects/:id/runs`
- `POST /api/projects/:id/runs/:runId/logs`
- `POST /api/projects/:id/artifacts`
- `GET /api/projects/:id/artifacts`

### 13.6 Review and memory APIs

- `POST /api/projects/:id/reviews`
- `GET /api/projects/:id/reviews`
- `POST /api/projects/:id/memories`
- `GET /api/projects/:id/memories`

## 14. UI Design Sketch

### 14.1 New top-level tab

Add a new navigation item:

- `Projects`

This route should not reuse the marketplace page model.

### 14.2 Suggested pages

- `ProjectsList`
- `ProjectDetail`
- `ProjectBoard`
- `ProjectMemory`
- `ProjectArtifacts`
- `ProjectAgents`

### 14.3 `ProjectDetail` layout

Recommended sections:

- project header
- goals and features sidebar
- work item board
- shared memory panel
- assignment and run timeline
- artifacts and review panel

### 14.4 Work item board columns

Recommended V1 columns:

- `Draft`
- `Ready`
- `Assigned`
- `In Progress`
- `In Review`
- `Needs Revision`
- `Accepted`

### 14.5 Agent management view

The project should expose:

- lead agent
- active worker agents
- current assignments
- paused or released agents
- performance signals

## 15. MCP Strategy

Do not expand MCP immediately to cover every project primitive.

Recommended rollout:

### Phase 1

Internal REST-first implementation only.

### Phase 2

Add MCP read tools:

- `list_projects`
- `get_project`
- `list_project_work_items`
- `get_project_work_item`

### Phase 3

Add MCP write tools carefully:

- `create_project_artifact`
- `create_project_review`
- `update_project_memory`

This keeps the orchestration surface controllable during early adoption.

## 16. Rollout Plan

### Phase A: Design and schema

- add new Prisma models
- generate migration
- add empty REST module skeleton

### Phase B: Basic server

- create project CRUD
- create goals, features, work items
- create assignments, runs, artifacts, reviews, memories

### Phase C: Basic UI

- add `Projects` tab
- implement project list and detail page
- implement work item board

### Phase D: Lead-agent workflow

- allow lead agent to create goals and work items from project brief
- allow assignment dispatch
- allow handoff and review

### Phase E: Cutover evaluation

When the new project platform is stable:

- make `Projects` the primary entry point
- keep legacy marketplace as `Legacy Tasks`
- optionally provide migration tools from legacy tasks into project work items

## 17. Migration Strategy

No migration is needed for V1 launch because the systems are parallel.

Later, if needed:

1. import old `tasks` into `project_work_items`
2. import old `submissions` into `project_artifacts`
3. import old `agent_sessions` into `project_runs`

This should be a one-way migration tool, not a permanent runtime dependency.

## 18. Open Questions

These should be decided during implementation:

1. Can one work item have multiple concurrent active assignments in V1.
2. Should project memories support semantic summarization on write.
3. Should lead agent actions always require human approval in `ACTIVE` projects.
4. How much execution trace should be stored in `project_run_logs` versus external blob storage.
5. Whether artifact files should reuse the current attachment mechanism or use a dedicated storage namespace.

## 19. Recommended First Implementation Slice

The first deliverable should be intentionally narrow:

1. New Prisma tables:
   `projects`, `project_goals`, `project_features`, `project_work_items`, `project_assignments`, `project_runs`, `project_artifacts`, `project_reviews`, `project_memories`
2. New server module:
   `aifactory-server/src/projects`
3. New UI route:
   `aifactory-ui/src/pages/Projects.tsx`
4. New detail route:
   `aifactory-ui/src/pages/ProjectDetail.tsx`

This slice is enough to prove the product shape before deeper automation.

## 20. Final Recommendation

Treat the new project platform as a parallel product line, not a patch on top of the marketplace.

That means:

- independent tab
- independent tables
- independent APIs
- shared `users`, but separate workflow model

If this architecture works in production, the entry point can later move from "task marketplace first" to "project platform first" with much lower risk.
