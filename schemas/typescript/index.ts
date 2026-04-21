// agent-workspace core types (v0.2 draft)
// Normative reference: docs/SPEC.md
// Machine reference: schemas/json-schema/entities.schema.json
//
// This file is hand-written for v0.2; once the JSON Schema stabilizes
// we will generate it with json-schema-to-typescript.

// ---------- Primitives ----------

export type Id = string;
export type ISODate = string;
export type Json = Record<string, unknown>;

// ---------- Enums ----------

export type ProjectStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";

export type GoalStatus = "OPEN" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED";

export type FeatureStatus =
  | "PLANNED" | "READY" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED";

export type WorkItemStatus =
  | "DRAFT" | "READY" | "ASSIGNED" | "IN_PROGRESS"
  | "IN_REVIEW" | "NEEDS_REVISION"
  | "ACCEPTED" | "REJECTED" | "CANCELLED";

export type AssignmentStatus =
  | "PROPOSED" | "ACTIVE" | "PAUSED" | "COMPLETED" | "RELEASED" | "FAILED";

export type RunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED";

export type ReviewStatus = "PENDING" | "APPROVED" | "CHANGES_REQUESTED" | "REJECTED";

export type ProposalStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "ESCALATED";

export type ProposalType =
  | "GOAL_DEFINITION" | "GOAL_CHANGE" | "GOAL_CLOSE" | "GOAL_REOPEN"
  | "BUDGET_INCREASE" | "REASSIGN" | "SCOPE_CHANGE" | "MEMBER_INVITE";

export type ConcurrencyMode = "SINGLE" | "RACE" | "MULTI_ROLE" | "PRIMARY_BACKUP";

export type MemoryType =
  | "DECISION" | "CONSTRAINT" | "FACT" | "RISK"
  | "OPEN_QUESTION" | "INTERFACE_CONTRACT";

export type MemberRole =
  | "OWNER" | "LEAD" | "PLANNER" | "WORKER"
  | "REVIEWER" | "PM" | "INTEGRATOR" | "OBSERVER";

export type CapabilityLevel = "novice" | "competent" | "expert";

export type CapabilitySource = "self_declared" | "verified_by_review" | "verified_by_metric";

export type ExternalType =
  | "GITHUB_ISSUE" | "GITHUB_PR" | "GITHUB_COMMIT" | "GITHUB_CI_RUN";

export type ExternalSource = "github" | "gitlab" | "custom";

export type NotificationPlatform =
  | "email" | "dingtalk" | "slack" | "mattermost" | "matrix"
  | "telegram" | "discord" | "homeassistant";

export type NotificationDeliveryStatus =
  | "QUEUED" | "SENT" | "FAILED" | "ACKED" | "REPLIED";

// EventType is an open enum. Known types listed; implementers may add namespaced types.
export type KnownEventType =
  | "GOAL_CREATED" | "GOAL_UPDATED" | "GOAL_CLOSED"
  | "FEATURE_CREATED" | "FEATURE_UPDATED"
  | "WORK_ITEM_CREATED" | "WORK_ITEM_STATUS_CHANGED"
  | "ASSIGNMENT_CREATED" | "ASSIGNMENT_RELEASED"
  | "RUN_STARTED" | "RUN_FINISHED"
  | "ARTIFACT_SUBMITTED" | "HANDOFF_SUBMITTED"
  | "REVIEW_REQUESTED" | "REVIEW_RESOLVED"
  | "MEMORY_WRITTEN"
  | "PROPOSAL_CREATED" | "PROPOSAL_RESOLVED"
  | "EXTERNAL_LINK_CREATED" | "EXTERNAL_EVENT_INGESTED"
  | "METRIC_SNAPSHOT_WRITTEN" | "INTEGRATE_REQUESTED" | "INTEGRATE_DONE";
export type EventType = KnownEventType | (string & {});

// ---------- Entities ----------

export interface ProjectSettings {
  autonomy?: {
    goalCreate?: "auto" | "proposal";
    goalClose?: "auto" | "proposal";
    budgetWarnThreshold?: number;
  };
  race?: {
    maxParticipants?: number;
  };
  [k: string]: unknown;
}

export interface Project {
  id: Id;
  name: string;
  slug: string;
  summary?: string;
  brief?: string;
  status: ProjectStatus;
  visibility?: "public" | "private";
  ownerId: Id;
  leadAgentUserId?: Id;
  budgetAmount?: number;
  budgetCurrency?: string;
  settings?: ProjectSettings;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Capability {
  id: Id;
  memberId: Id;
  capability: string;
  level: CapabilityLevel;
  source: CapabilitySource;
  createdAt?: ISODate;
}

export interface Member {
  id: Id;
  projectId: Id;
  userId: Id;
  role: MemberRole;
  permissions?: Json;
  capabilities?: Capability[];
  joinedAt: ISODate;
  removedAt?: ISODate;
}

export interface Goal {
  id: Id;
  projectId: Id;
  title: string;
  description?: string;
  priority?: number;
  status: GoalStatus;
  sortOrder?: number;
  createdById: Id;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Feature {
  id: Id;
  projectId: Id;
  goalId?: Id;
  title: string;
  description?: string;
  status: FeatureStatus;
  priority?: number;
  sortOrder?: number;
  spec?: Json;
  createdById: Id;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface WorkItem {
  id: Id;
  projectId: Id;
  goalId?: Id;
  featureId?: Id;
  parentWorkItemId?: Id;
  title: string;
  description?: string;
  workType: string;
  status: WorkItemStatus;
  priority?: number;
  scopeBrief?: string;
  acceptanceCriteria?: string;
  inputPacket?: Json;
  outputContract?: Json;
  dependsOn?: Id[];
  concurrencyMode?: ConcurrencyMode;
  createdById: Id;
  ownerId?: Id;
  dueAt?: ISODate;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface TaskPacket {
  objective: string;
  acceptanceCriteria: string;
  memoryRefs?: Id[];
  dependencies?: Array<{ workItemId: Id; summary: string }>;
  suggestedSkills?: string[];
  outputContract?: Json;
}

export interface Assignment {
  id: Id;
  projectId: Id;
  workItemId: Id;
  assigneeUserId: Id;
  assignedByUserId: Id;
  role: MemberRole;
  status: AssignmentStatus;
  objective?: string;
  contextPacket?: TaskPacket;
  concurrencyModeOverride?: ConcurrencyMode;
  startedAt?: ISODate;
  finishedAt?: ISODate;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Run {
  id: Id;
  projectId: Id;
  workItemId: Id;
  assignmentId?: Id;
  triggeredByUserId?: Id;
  runType: string;
  status: RunStatus;
  instruction?: string;
  contextSnapshot?: Json;
  resultSummary?: string;
  costInfo?: Json;
  startedAt?: ISODate;
  finishedAt?: ISODate;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Artifact {
  id: Id;
  projectId: Id;
  workItemId?: Id;
  assignmentId?: Id;
  runId?: Id;
  artifactType: string;
  title?: string;
  content?: string;
  url?: string;
  metadata?: Json;
  createdByUserId: Id;
  createdAt: ISODate;
}

export interface Review {
  id: Id;
  projectId: Id;
  workItemId: Id;
  assignmentId?: Id;
  artifactId?: Id;
  reviewerUserId?: Id;
  reviewerType: "agent" | "human" | "rule";
  status: ReviewStatus;
  reviewNote?: string;
  checklistResult?: Json;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Memory {
  id: Id;
  projectId: Id;
  memoryType: MemoryType;
  title?: string;
  content: string;
  summary?: string;
  metadata?: Json;
  sourceArtifactId?: Id;
  createdByUserId: Id;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface Proposal {
  id: Id;
  projectId: Id;
  type: ProposalType;
  payload: Json;
  reason?: string;
  createdByUserId: Id;
  approverUserIds: Id[];
  status: ProposalStatus;
  resolvedByUserId?: Id;
  resolvedNote?: string;
  expiresAt?: ISODate;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface ProjectEvent {
  id: Id;
  projectId: Id;
  seq: number;
  type: EventType;
  refType?: string;
  refId?: Id;
  payload?: Json;
  actorUserId?: Id;
  createdAt: ISODate;
}

export interface ExternalLink {
  id: Id;
  projectId: Id;
  refType: "WORK_ITEM" | "ARTIFACT";
  refId: Id;
  externalType: ExternalType;
  externalId: string;
  externalUrl: string;
  metadata?: Json;
  createdAt: ISODate;
}

export interface ExternalEvent {
  id: Id;
  projectId: Id;
  source: ExternalSource;
  externalEventId: string;
  kind: string;
  payload?: Json;
  linkedWorkItemId?: Id;
  mappedEventId?: Id;
  receivedAt: ISODate;
}

export interface MetricSnapshot {
  id: Id;
  projectId: Id;
  periodKey: string;
  wipCount?: number;
  cycleTimeP50Hours?: number;
  cycleTimeP90Hours?: number;
  reviewPassRate?: number;
  bugRate?: number;
  budgetConsumed?: number;
  budgetRemaining?: number;
  membersStats?: Json;
  computedAt: ISODate;
}

export interface NotificationChannel {
  id: Id;
  userId: Id;
  platform: NotificationPlatform;
  externalAccountId: string;
  displayName?: string;
  priority: number;
  enabled: boolean;
  verifiedAt?: ISODate;
  pairingCode?: string;
  pairingExpiresAt?: ISODate;
  createdAt?: ISODate;
  updatedAt?: ISODate;
}

export interface NotificationDelivery {
  id: Id;
  refType: "PROPOSAL" | "EVENT" | "REPORT";
  refId: Id;
  userId: Id;
  channelId: Id;
  platform: NotificationPlatform;
  templateKey: string;
  status: NotificationDeliveryStatus;
  attempts: number;
  lastError?: string;
  messageExternalId?: string;
  replyPayload?: Json;
  createdAt: ISODate;
  updatedAt: ISODate;
}

// ---------- MCP tool I/O (minimal; will be expanded in v0.3) ----------

export interface Pagination {
  limit?: number;
  cursor?: string;
}

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

export interface EventListInput {
  projectId: Id;
  sinceSeq?: number;
  types?: EventType[];
  limit?: number;
}

export interface EventListOutput {
  events: ProjectEvent[];
  lastSeq: number;
}

export interface GoalCloseInput {
  goalId: Id;
  reason: string;
  cascade?: boolean;
}

export interface GoalCloseOutput {
  goal: Goal;
  affected: {
    features: Id[];
    workItems: Id[];
    assignments: Id[];
    runs: Id[];
  };
}

export interface ProposalResolveInput {
  proposalId: Id;
  decision: "APPROVE" | "REJECT";
  note?: string;
}
