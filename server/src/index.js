import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { TosClient, TosServerError } from '@volcengine/tos-sdk';
import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3010),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().min(1),
  AGENT_WORKSPACE_HOST_KEY: z.string().min(1),
  AGENT_WORKSPACE_RUNTIME_REGISTRATION_KEY: z.string().optional(),
  AGENT_WORKSPACE_INTEGRATION_KEY: z.string().optional(),
  AGENT_WORKSPACE_JWT_SECRET: z.string().min(1),
  AGENT_WORKSPACE_TOKEN_TTL_SECONDS: z.coerce.number().default(3600),
  PROJECT_STORAGE_ACCESS_KEY: z.string().optional(),
  PROJECT_STORAGE_SECRET_KEY: z.string().optional(),
  PROJECT_STORAGE_REGION: z.string().optional(),
  PROJECT_STORAGE_ENDPOINT: z.string().optional(),
  PROJECT_STORAGE_BUCKET: z.string().optional(),
  PROJECT_STORAGE_FOLDER: z.string().optional(),
  PROJECT_STORAGE_PUBLIC_URL: z.string().optional(),
  TOS_ACCESS_KEY: z.string().optional(),
  TOS_SECRET_KEY: z.string().optional(),
  TOS_REGION: z.string().optional(),
  TOS_ENDPOINT: z.string().optional(),
  TOS_BUCKET: z.string().optional(),
  TOS_FOLDER: z.string().optional(),
  TOS_PUBLIC_URL: z.string().optional(),
});

const env = envSchema.parse(process.env);
const prisma = new PrismaClient();
const app = Fastify({ logger: true });
await app.register(multipart, {
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 1,
  },
});

const runtimeTokenSchema = z.object({
  projectId: z.string(),
  runtimeId: z.string(),
  memberId: z.string(),
  grantId: z.string(),
  scopes: z.array(z.string()).default([]),
  exp: z.number().optional(),
});

const createProjectSchema = z.object({
  externalRef: z.string().trim().min(1).max(191).optional(),
  name: z.string().trim().min(1).max(191),
  slug: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().optional(),
  githubUrl: z.string().trim().url().optional(),
  ownerUserId: z.string().trim().min(1),
  leadUserId: z.string().trim().optional(),
  visibility: z.string().trim().optional(),
  budgetAmount: z.number().nonnegative().optional(),
  budgetCurrency: z.string().trim().min(1).max(12).optional(),
  source: z.record(z.any()).optional(),
  settings: z.record(z.any()).optional(),
  initialContext: z
    .object({
      brief: z.string().optional(),
      goal: z
        .object({
          title: z.string().trim().min(1).max(191),
          description: z.string().trim().optional(),
        })
        .optional(),
      links: z.array(z.any()).optional(),
    })
    .optional(),
});

const updateProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(191).optional(),
    description: z.string().trim().nullable().optional(),
    brief: z.string().trim().nullable().optional(),
    githubUrl: z.string().trim().url().nullable().optional(),
    visibility: z.string().trim().optional(),
    leadUserId: z.string().trim().nullable().optional(),
    budgetAmount: z.number().nonnegative().optional(),
    budgetCurrency: z.string().trim().min(1).max(12).nullable().optional(),
    settings: z.record(z.any()).optional(),
  })
  .refine(
    (input) => Object.keys(input).length > 0,
    { message: 'At least one project field must be provided' },
  );

const registerRuntimeSchema = z.object({
  runtimeId: z.string().trim().optional(),
  memberId: z.string().trim().optional(),
  provider: z.string().trim().default('local'),
  framework: z.string().trim().min(1),
  model: z.string().trim().optional(),
  metadata: z.record(z.any()).optional(),
  wakeEndpoint: z.string().trim().optional(),
});

const issueGrantSchema = z.object({
  memberId: z.string().trim().min(1),
  runtimeId: z.string().trim().min(1),
  scopes: z.array(z.string()).min(1),
  reason: z.string().trim().optional(),
  expiresAt: z.string().datetime().optional(),
  skillBundleRefs: z.array(z.string()).optional(),
  issuedByMemberId: z.string().trim().optional(),
});

const resumeRuntimeSchema = z.object({
  projectId: z.string().trim().min(1),
  cursor: z.string().trim().optional(),
});

const heartbeatSchema = z.object({
  projectId: z.string().trim().min(1),
  status: z.string().trim().min(1),
  assignmentId: z.string().trim().optional(),
  message: z.string().trim().optional(),
});

const projectFileListQuerySchema = z.object({
  prefix: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  cursor: z.string().optional(),
});

const projectFilePathQuerySchema = z.object({
  path: z.string().trim().min(1),
  encoding: z.enum(['text', 'base64']).optional(),
  expiresIn: z.coerce.number().int().min(60).max(86400).default(3600),
});

const projectFileWriteSchema = z.object({
  path: z.string().trim().min(1),
  content: z.string().default(''),
  encoding: z.enum(['text', 'base64']).default('text'),
  contentType: z.string().trim().optional(),
});

const createMessageSchema = z.object({
  threadId: z.string().trim().optional(),
  threadRefType: z.string().trim().optional(),
  threadRefId: z.string().trim().optional(),
  threadTitle: z.string().trim().optional(),
  body: z.string().trim().min(1),
  visibility: z
    .enum(['THREAD_PARTICIPANTS', 'SENDER_AND_TARGET_ONLY', 'HUMAN_ONLY'])
    .default('THREAD_PARTICIPANTS'),
  messageType: z.enum(['NOTE', 'QUESTION', 'ALERT', 'REPLY', 'STATUS_UPDATE']).default('NOTE'),
  senderMemberId: z.string().trim().optional(),
  targetMemberIds: z.array(z.string()).optional(),
  mentions: z.array(z.string()).optional(),
  requiresAck: z.boolean().default(false),
  metadata: z.record(z.any()).optional(),
});

const createAssignmentSchema = z.object({
  workItemId: z.string().trim().min(1),
  assigneeMemberId: z.string().trim().min(1),
  assignedByUserId: z.string().trim().optional(),
  targetRuntimeId: z.string().trim().optional(),
  role: z.string().trim().default('WORKER'),
  objective: z.string().trim().optional(),
  contextPacket: z.record(z.any()).optional(),
});

const createFeatureSchema = z.object({
  goalId: z.string().trim().optional(),
  title: z.string().trim().min(1).max(191),
  description: z.string().trim().optional(),
  priority: z.number().int().optional(),
  sortOrder: z.number().int().optional(),
  spec: z.record(z.any()).optional(),
  createdByUserId: z.string().trim().optional(),
});

const createWorkItemSchema = z.object({
  goalId: z.string().trim().optional(),
  featureId: z.string().trim().optional(),
  parentWorkItemId: z.string().trim().optional(),
  title: z.string().trim().min(1).max(191),
  description: z.string().trim().optional(),
  workType: z.string().trim().min(1).max(50).default('PLANNING'),
  scopeBrief: z.string().trim().optional(),
  acceptanceCriteria: z.string().trim().optional(),
  inputPacket: z.record(z.any()).optional(),
  outputContract: z.record(z.any()).optional(),
  dependsOn: z.array(z.string()).optional(),
  concurrencyMode: z.enum(['SINGLE', 'RACE', 'MULTI_ROLE', 'PRIMARY_BACKUP']).optional(),
  priority: z.number().int().optional(),
  ownerId: z.string().trim().optional(),
  dueAt: z.string().datetime().optional(),
  createdByUserId: z.string().trim().optional(),
});

const createProposalSchema = z.object({
  type: z.string().trim().min(1),
  title: z.string().trim().optional(),
  summary: z.string().trim().optional(),
  payload: z.record(z.any()).default({}),
  reason: z.string().trim().optional(),
  approverMemberIds: z.array(z.string()).min(1),
  createdByMemberId: z.string().trim().optional(),
  expiresAt: z.string().datetime().optional(),
});

const createReviewSchema = z.object({
  assignmentId: z.string().trim().min(1),
  artifactId: z.string().trim().optional(),
  reviewerMemberId: z.string().trim().optional(),
  decision: z.enum(['PENDING', 'APPROVED', 'REQUEST_CHANGES', 'REJECTED']),
  summary: z.string().trim().optional(),
  details: z.record(z.any()).optional(),
});

const ingestExternalEventSchema = z.object({
  source: z.string().trim().min(1),
  type: z.string().trim().min(1),
  externalRef: z.string().trim().min(1),
  relatedAssignmentId: z.string().trim().optional(),
  relatedWorkItemId: z.string().trim().optional(),
  payload: z.record(z.any()).default({}),
});

function getHeaderValue(request, name) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function unauthorized(message) {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
}

function forbidden(message) {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function notFound(message) {
  const error = new Error(message);
  error.statusCode = 404;
  return error;
}

function slugify(input) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function getProjectGithubUrl(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return null;
  }

  const githubUrl = settings.githubUrl;
  return typeof githubUrl === 'string' && githubUrl.trim() ? githubUrl.trim() : null;
}

function storageConfig() {
  return {
    accessKeyId: env.PROJECT_STORAGE_ACCESS_KEY || env.TOS_ACCESS_KEY,
    accessKeySecret: env.PROJECT_STORAGE_SECRET_KEY || env.TOS_SECRET_KEY,
    region: env.PROJECT_STORAGE_REGION || env.TOS_REGION || 'cn-beijing',
    endpoint: env.PROJECT_STORAGE_ENDPOINT || env.TOS_ENDPOINT,
    bucket: env.PROJECT_STORAGE_BUCKET || env.TOS_BUCKET,
    folder: env.PROJECT_STORAGE_FOLDER || env.TOS_FOLDER || '',
    publicUrl: env.PROJECT_STORAGE_PUBLIC_URL || env.TOS_PUBLIC_URL,
  };
}

let projectStorageClient;
function getProjectStorageClient() {
  const config = storageConfig();
  if (!config.accessKeyId || !config.accessKeySecret || !config.bucket) {
    throw badRequest('Project storage is not configured');
  }
  if (!projectStorageClient) {
    projectStorageClient = new TosClient({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      region: config.region,
      endpoint: config.endpoint,
      maxRetryCount: 3,
    });
  }
  return projectStorageClient;
}

function normalizeProjectFilePath(input, { allowEmpty = false } = {}) {
  const raw = String(input || '').replace(/\\/g, '/').trim();
  if (!raw) {
    if (allowEmpty) return '';
    throw badRequest('File path is required');
  }
  const parts = [];
  for (const part of raw.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') {
      throw badRequest('File path must stay inside project storage');
    }
    parts.push(part);
  }
  const normalized = parts.join('/');
  if (!normalized && !allowEmpty) {
    throw badRequest('File path is required');
  }
  return normalized;
}

function projectStoragePrefix(projectId) {
  const config = storageConfig();
  const folder = normalizeProjectFilePath(config.folder, { allowEmpty: true });
  return [folder, 'projects', projectId, 'shared'].filter(Boolean).join('/') + '/';
}

function projectStorageKey(projectId, filePath) {
  return `${projectStoragePrefix(projectId)}${normalizeProjectFilePath(filePath)}`;
}

function projectFilePathFromKey(projectId, key) {
  const prefix = projectStoragePrefix(projectId);
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

function normalizeUploadPath(inputPath, originalName) {
  const fallback = normalizeProjectFilePath(originalName || 'upload.bin').split('/').pop() || 'upload.bin';
  const raw = String(inputPath || '').trim();
  if (!raw) return fallback;
  return normalizeProjectFilePath(raw.endsWith('/') ? `${raw}${fallback}` : raw);
}

function isProbablyText(contentType, filePath) {
  const type = String(contentType || '').toLowerCase();
  if (type.startsWith('text/') || type.includes('json') || type.includes('xml') || type.includes('yaml')) {
    return true;
  }
  return /\.(txt|md|json|ya?ml|csv|tsv|log|xml|html|css|js|jsx|ts|tsx|py|java|go|rs|sql|sh|env)$/i.test(filePath || '');
}

async function bodyToBuffer(body) {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body.transformToByteArray === 'function') {
    return Buffer.from(await body.transformToByteArray());
  }
  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function projectFileDownloadUrlFromPublicBase(key) {
  const config = storageConfig();
  return config.publicUrl ? `${config.publicUrl.replace(/\/+$/, '')}/${key}` : null;
}

async function resolveUniqueSlug(name, preferredSlug) {
  const base = slugify(preferredSlug || name) || `project-${Date.now()}`;
  let candidate = base;
  let suffix = 1;

  while (await prisma.project.findUnique({ where: { slug: candidate }, select: { id: true } })) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }

  return candidate;
}

async function appendProjectEvent(tx, { projectId, type, refType = null, refId = null, actorUserId = null, payload = null }) {
  const maxSeq = await tx.projectEvent.aggregate({
    where: { projectId },
    _max: { seq: true },
  });

  return tx.projectEvent.create({
    data: {
      id: randomUUID(),
      projectId,
      seq: (maxSeq._max.seq ?? 0) + 1,
      type,
      refType,
      refId,
      actorUserId,
      payload,
    },
  });
}

async function requireHost(request) {
  const hostKey = getHeaderValue(request, 'x-agent-workspace-host-key');
  if (!hostKey || hostKey !== env.AGENT_WORKSPACE_HOST_KEY) {
    throw unauthorized('Invalid host credentials');
  }

  return { type: 'host' };
}

function verifyRuntimeToken(request) {
  const authHeader = getHeaderValue(request, 'authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw unauthorized('Missing runtime bearer token');
  }

  const token = authHeader.slice('Bearer '.length);
  let payload;
  try {
    payload = jwt.verify(token, env.AGENT_WORKSPACE_JWT_SECRET);
  } catch {
    throw unauthorized('Invalid runtime bearer token');
  }

  return runtimeTokenSchema.parse(payload);
}

async function requireRuntime(request, { projectId, runtimeId, scope } = {}) {
  const token = verifyRuntimeToken(request);

  if (projectId && token.projectId !== projectId) {
    throw forbidden('Runtime token does not match project');
  }
  if (runtimeId && token.runtimeId !== runtimeId) {
    throw forbidden('Runtime token does not match runtime');
  }
  if (scope && !token.scopes.includes(scope)) {
    throw forbidden(`Runtime token missing required scope: ${scope}`);
  }

  const grant = await prisma.projectAccessGrant.findFirst({
    where: {
      id: token.grantId,
      projectId: token.projectId,
      runtimeId: token.runtimeId,
      memberId: token.memberId,
      status: 'ACTIVE',
    },
  });

  if (!grant) {
    throw forbidden('Runtime access grant is not active');
  }

  if (grant.expiresAt && grant.expiresAt <= new Date()) {
    throw forbidden('Runtime access grant has expired');
  }

  return { type: 'runtime', token, grant };
}

async function requireHostOrRuntime(request, options = {}) {
  const hostKey = getHeaderValue(request, 'x-agent-workspace-host-key');
  if (hostKey && hostKey === env.AGENT_WORKSPACE_HOST_KEY) {
    return { type: 'host' };
  }

  return requireRuntime(request, options);
}

async function requireIntegrationOrHost(request) {
  const hostKey = getHeaderValue(request, 'x-agent-workspace-host-key');
  if (hostKey && hostKey === env.AGENT_WORKSPACE_HOST_KEY) {
    return { type: 'host' };
  }

  const integrationKey = getHeaderValue(request, 'x-agent-workspace-integration-key');
  if (!integrationKey || integrationKey !== (env.AGENT_WORKSPACE_INTEGRATION_KEY || env.AGENT_WORKSPACE_HOST_KEY)) {
    throw unauthorized('Invalid integration credentials');
  }

  return { type: 'integration' };
}

async function getUserOrThrow(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, displayName: true, role: true },
  });

  if (!user) {
    throw badRequest(`User not found: ${userId}`);
  }

  return user;
}

async function getProjectOrThrow(projectId) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    throw notFound('Project not found');
  }
  return project;
}

async function getProjectMemberOrThrow(projectId, memberId) {
  const member = await prisma.projectMember.findFirst({
    where: { id: memberId, projectId, removedAt: null },
  });

  if (!member) {
    throw badRequest(`Project member not found: ${memberId}`);
  }

  return member;
}

async function actorUserIdFromAuth(projectId, auth, explicitUserId) {
  if (auth.type === 'runtime') {
    const member = await getProjectMemberOrThrow(projectId, auth.token.memberId);
    return member.userId;
  }
  if (explicitUserId) {
    const user = await getUserOrThrow(explicitUserId);
    return user.id;
  }
  const project = await getProjectOrThrow(projectId);
  return project.ownerId;
}

async function ensureProjectReference(projectId, type, id) {
  if (!id) return;
  const modelByType = {
    goal: prisma.projectGoal,
    feature: prisma.projectFeature,
    workItem: prisma.projectWorkItem,
  };
  const model = modelByType[type];
  if (!model) return;
  const found = await model.findFirst({ where: { id, projectId }, select: { id: true } });
  if (!found) {
    throw badRequest(`${type} not found in project`);
  }
}

async function getThreadForWrite(projectId, input, createdByMemberId = null) {
  if (input.threadId) {
    const existingThread = await prisma.projectThread.findFirst({
      where: { id: input.threadId, projectId },
    });
    if (!existingThread) {
      throw badRequest('Thread not found in project');
    }
    return existingThread;
  }

  if (!input.threadRefType || !input.threadRefId) {
    throw badRequest('threadId or threadRefType/threadRefId is required');
  }

  const existingThread = await prisma.projectThread.findFirst({
    where: {
      projectId,
      refType: input.threadRefType,
      refId: input.threadRefId,
      status: 'OPEN',
    },
  });

  if (existingThread) {
    return existingThread;
  }

  return prisma.projectThread.create({
    data: {
      id: randomUUID(),
      projectId,
      threadType: input.threadRefType,
      refType: input.threadRefType,
      refId: input.threadRefId,
      title: input.threadTitle || `${input.threadRefType}:${input.threadRefId}`,
      status: 'OPEN',
      createdByMemberId,
    },
  });
}

async function createInboxItem(tx, input) {
  return tx.projectInboxItem.create({
    data: {
      id: randomUUID(),
      projectId: input.projectId,
      targetMemberId: input.targetMemberId ?? null,
      targetRuntimeId: input.targetRuntimeId ?? null,
      sourceMemberId: input.sourceMemberId ?? null,
      kind: input.kind,
      ownerActionType: input.ownerActionType,
      priority: input.priority ?? 'NORMAL',
      status: input.status ?? 'UNREAD',
      wakeHint: input.wakeHint ?? 'NEXT_ENTRY',
      refType: input.refType ?? null,
      refId: input.refId ?? null,
      threadId: input.threadId ?? null,
      summary: input.summary,
      details: input.details ?? null,
      supersededByInboxItemId: null,
    },
  });
}

function mapPresence(status) {
  const normalized = status.trim().toUpperCase();
  if (['ACTIVE', 'WORKING', 'RUNNING'].includes(normalized)) return 'ACTIVE';
  if (['IDLE', 'READY'].includes(normalized)) return 'IDLE';
  if (['SLEEPING', 'PAUSED'].includes(normalized)) return 'SLEEPING';
  if (['UNREACHABLE'].includes(normalized)) return 'UNREACHABLE';
  return 'ACTIVE';
}

function runtimeMetadataFromAuth(auth) {
  if (!auth || auth.type !== 'runtime') {
    return null;
  }

  return {
    source: 'agent-runtime',
    runtimeId: auth.token.runtimeId,
    memberId: auth.token.memberId,
    grantId: auth.token.grantId,
    scopes: auth.token.scopes,
    stampedAt: new Date().toISOString(),
  };
}

app.setErrorHandler((error, _request, reply) => {
  const statusCode = error.statusCode || (error instanceof TosServerError ? error.statusCode : undefined) || 500;
  reply.status(statusCode).send({
    error: {
      message: error.message,
      code: error instanceof TosServerError ? error.code : undefined,
      requestId: error instanceof TosServerError ? error.requestId : undefined,
      statusCode,
    },
  });
});

app.get('/health', async () => {
  await prisma.$queryRaw`SELECT 1`;
  return { status: 'ok', service: 'agent-workspace', time: new Date().toISOString() };
});

app.post('/v1/host-sessions', async (request) => {
  await requireHost(request);
  return {
    principalType: 'HostClient',
    validatedAt: new Date().toISOString(),
  };
});

app.get('/v1/projects', async (request) => {
  await requireHost(request);
  const query = request.query ?? {};
  const page = Math.max(parseInt(query.page ?? '1', 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit ?? '20', 10) || 20, 1), 100);
  const where = {};

  if (query.status) {
    where.status = query.status;
  }

  if (query.search) {
    where.OR = [
      { name: { contains: query.search } },
      { summary: { contains: query.search } },
      { brief: { contains: query.search } },
    ];
  }

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        summary: true,
        brief: true,
        status: true,
        visibility: true,
        ownerId: true,
        leadAgentUserId: true,
        budgetAmount: true,
        budgetCurrency: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            members: true,
            workItems: true,
            artifacts: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.project.count({ where }),
  ]);

  return {
    data: projects.map((project) => ({
      projectId: project.id,
      name: project.name,
      slug: project.slug,
      summary: project.summary,
      brief: project.brief,
      status: project.status,
      visibility: project.visibility,
      ownerUserId: project.ownerId,
      leadUserId: project.leadAgentUserId,
      budgetAmount: project.budgetAmount,
      budgetCurrency: project.budgetCurrency,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      counts: {
        members: project._count.members,
        workItems: project._count.workItems,
        artifacts: project._count.artifacts,
      },
      githubUrl: getProjectGithubUrl(project.settings),
    })),
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
});

app.post('/v1/projects', async (request) => {
  await requireHost(request);
  const input = createProjectSchema.parse(request.body ?? {});

  const owner = await getUserOrThrow(input.ownerUserId);
  let lead = null;
  if (input.leadUserId) {
    lead = await getUserOrThrow(input.leadUserId);
  }

  const slug = await resolveUniqueSlug(input.name, input.slug);

  const project = await prisma.$transaction(async (tx) => {
    const createdProject = await tx.project.create({
      data: {
        id: randomUUID(),
        name: input.name,
        slug,
        summary: input.description ?? null,
        brief: input.initialContext?.brief ?? null,
        status: 'DRAFT',
        visibility: input.visibility ?? 'private',
        ownerId: owner.id,
        leadAgentUserId: lead?.id ?? null,
        budgetAmount: input.budgetAmount ?? 0,
        budgetCurrency: input.budgetCurrency ?? 'AIC',
        settings: {
          ...(input.settings ?? {}),
          githubUrl: input.githubUrl ?? null,
          source: input.source ?? null,
          initialLinks: input.initialContext?.links ?? [],
        },
      },
    });

    const ownerMember = await tx.projectMember.create({
      data: {
        id: randomUUID(),
        projectId: createdProject.id,
        userId: owner.id,
        role: 'OWNER',
      },
    });

    let leadMember = null;
    if (lead && lead.id !== owner.id) {
      leadMember = await tx.projectMember.create({
        data: {
          id: randomUUID(),
          projectId: createdProject.id,
          userId: lead.id,
          role: 'LEAD_AGENT',
        },
      });
    } else if (lead?.id === owner.id) {
      leadMember = ownerMember;
    }

    let initialGoal = null;
    const initialGoalInput = input.initialContext?.goal;
    if (initialGoalInput?.title) {
      initialGoal = await tx.projectGoal.create({
        data: {
          id: randomUUID(),
          projectId: createdProject.id,
          title: initialGoalInput.title,
          description: initialGoalInput.description ?? input.initialContext?.brief ?? null,
          priority: 0,
          status: 'OPEN',
          sortOrder: 0,
          createdById: owner.id,
        },
      });
    }

    await tx.project.update({
      where: { id: createdProject.id },
      data: {
        settings: {
          ...(createdProject.settings ?? {}),
          externalRef: input.externalRef ?? null,
          ownerMemberId: ownerMember.id,
          leadMemberId: leadMember?.id ?? null,
        },
      },
    });

    await appendProjectEvent(tx, {
      projectId: createdProject.id,
      type: 'PROJECT_CREATED',
      refType: 'PROJECT',
      refId: createdProject.id,
      actorUserId: owner.id,
      payload: {
        name: createdProject.name,
        externalRef: input.externalRef ?? null,
      },
    });

    if (initialGoal) {
      await appendProjectEvent(tx, {
        projectId: createdProject.id,
        type: 'GOAL_CREATED',
        refType: 'GOAL',
        refId: initialGoal.id,
        actorUserId: owner.id,
        payload: {
          title: initialGoal.title,
          source: 'initialContext',
        },
      });
    }

    return { createdProject, ownerMember, leadMember, initialGoal };
  });

  return {
    projectId: project.createdProject.id,
    slug: project.createdProject.slug,
    status: project.createdProject.status,
    ownerMemberId: project.ownerMember.id,
    leadMemberId: project.leadMember?.id ?? null,
    initialGoalId: project.initialGoal?.id ?? null,
    createdAt: project.createdProject.createdAt,
  };
});

app.patch('/v1/projects/:projectId', async (request) => {
  await requireHost(request);
  const { projectId } = request.params;
  const input = updateProjectSchema.parse(request.body ?? {});

  const project = await getProjectOrThrow(projectId);

  let leadUserId = project.leadAgentUserId;
  if (input.leadUserId !== undefined) {
    if (input.leadUserId) {
      const lead = await getUserOrThrow(input.leadUserId);
      leadUserId = lead.id;
    } else {
      leadUserId = null;
    }
  }

  const existingSettings =
    project.settings && typeof project.settings === 'object' && !Array.isArray(project.settings)
      ? project.settings
      : {};

  const mergedSettings = {
    ...existingSettings,
    ...(input.settings ?? {}),
  };

  if (input.githubUrl !== undefined) {
    if (input.githubUrl) {
      mergedSettings.githubUrl = input.githubUrl;
    } else {
      delete mergedSettings.githubUrl;
    }
  }

  const updated = await prisma.project.update({
    where: { id: projectId },
    data: {
      name: input.name,
      summary: input.description,
      brief: input.brief,
      visibility: input.visibility,
      leadAgentUserId: leadUserId,
      budgetAmount: input.budgetAmount,
      budgetCurrency: input.budgetCurrency,
      settings: mergedSettings,
    },
  });

  return {
    projectId: updated.id,
    name: updated.name,
    slug: updated.slug,
    status: updated.status,
    visibility: updated.visibility,
    githubUrl: getProjectGithubUrl(mergedSettings),
    ownerUserId: updated.ownerId,
    leadUserId: updated.leadAgentUserId,
    description: updated.summary,
    brief: updated.brief,
    budgetAmount: updated.budgetAmount,
    budgetCurrency: updated.budgetCurrency,
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  };
});

app.get('/v1/projects/:projectId', async (request) => {
  const { projectId } = request.params;
  await requireHostOrRuntime(request, { projectId, scope: 'PROJECT_READ_BASIC' });
  const project = await getProjectOrThrow(projectId);

  const [goalCount, openAssignmentCount, openBlockerCount] = await Promise.all([
    prisma.projectGoal.count({ where: { projectId } }),
    prisma.projectAssignment.count({
      where: { projectId, status: { in: ['PROPOSED', 'ACTIVE', 'PAUSED'] } },
    }),
    prisma.projectWorkItem.count({
      where: { projectId, status: 'BLOCKED' },
    }),
  ]);

  const settings = project.settings && typeof project.settings === 'object' ? project.settings : {};

  return {
    projectId: project.id,
    name: project.name,
    slug: project.slug,
    status: project.status,
    visibility: project.visibility,
    githubUrl: getProjectGithubUrl(settings),
    ownerUserId: project.ownerId,
    leadUserId: project.leadAgentUserId,
    description: project.summary,
    brief: project.brief,
    budgetAmount: project.budgetAmount,
    budgetCurrency: project.budgetCurrency,
    summary: {
      goalCount,
      openAssignmentCount,
      openBlockerCount,
    },
    source: settings.source ?? null,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
  };
});

app.get('/v1/projects/:projectId/board', async (request) => {
  const { projectId } = request.params;
  await requireHostOrRuntime(request, { projectId, scope: 'PROJECT_BOARD_READ' });
  await getProjectOrThrow(projectId);

  const [members, goals, workItems, assignments, reviews, inboxItems, presenceRows] = await Promise.all([
    prisma.projectMember.count({ where: { projectId, removedAt: null } }),
    prisma.projectGoal.findMany({
      where: { projectId },
      select: { id: true, title: true, description: true, priority: true, status: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    }),
    prisma.projectWorkItem.findMany({
      where: { projectId },
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        featureId: true,
        ownerId: true,
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 50,
    }),
    prisma.projectAssignment.findMany({
      where: { projectId },
      select: {
        id: true,
        workItemId: true,
        assigneeUserId: true,
        status: true,
        role: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    }),
    prisma.projectReview.count({ where: { projectId, status: 'PENDING' } }),
    prisma.projectInboxItem.findMany({
      where: { projectId, status: { in: ['UNREAD', 'READ', 'ACKED'] } },
      select: {
        id: true,
        kind: true,
        ownerActionType: true,
        priority: true,
        status: true,
        targetMemberId: true,
        targetRuntimeId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.participantPresence.findMany({
      where: { projectId },
      select: {
        memberId: true,
        runtimeId: true,
        presence: true,
        lastHeartbeatAt: true,
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  const openCiIncidents = await prisma.projectInboxItem.count({
    where: { projectId, kind: 'CI_INCIDENT', status: { in: ['UNREAD', 'READ', 'ACKED'] } },
  });

  return {
    projectId,
    summary: {
      memberCount: members,
      openAssignments: assignments.filter((item) => ['PROPOSED', 'ACTIVE', 'PAUSED'].includes(item.status)).length,
      pendingReviews: reviews,
      openCiIncidents,
    },
    memberPresence: presenceRows,
    goalSummaries: goals,
    assignmentSummaries: assignments,
    workItemSummaries: workItems,
    inboxSummary: inboxItems,
  };
});

app.get('/v1/projects/:projectId/members', async (request) => {
  const { projectId } = request.params;
  await requireHostOrRuntime(request, { projectId, scope: 'PROJECT_MEMBER_READ' });
  await getProjectOrThrow(projectId);

  const members = await prisma.projectMember.findMany({
    where: { projectId, removedAt: null },
    orderBy: { joinedAt: 'asc' },
  });

  const userIds = [...new Set(members.map((member) => member.userId))];
  const memberIds = members.map((member) => member.id);

  const [users, grants, presenceRows] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true, displayName: true, role: true },
    }),
    prisma.projectAccessGrant.findMany({
      where: { projectId, memberId: { in: memberIds }, status: { in: ['PENDING', 'ACTIVE'] } },
      orderBy: { issuedAt: 'desc' },
    }),
    prisma.participantPresence.findMany({
      where: { projectId, memberId: { in: memberIds } },
      orderBy: { updatedAt: 'desc' },
    }),
  ]);

  const runtimeIds = [...new Set([...grants.map((grant) => grant.runtimeId), ...presenceRows.map((row) => row.runtimeId).filter(Boolean)])];
  const runtimes = runtimeIds.length
    ? await prisma.agentRuntime.findMany({
        where: { id: { in: runtimeIds } },
      })
    : [];

  const usersById = new Map(users.map((user) => [user.id, user]));
  const runtimesById = new Map(runtimes.map((runtime) => [runtime.id, runtime]));
  const grantsByMember = new Map();
  const presenceByMember = new Map();

  for (const grant of grants) {
    const current = grantsByMember.get(grant.memberId) ?? [];
    current.push(grant);
    grantsByMember.set(grant.memberId, current);
  }
  for (const row of presenceRows) {
    if (!presenceByMember.has(row.memberId)) {
      presenceByMember.set(row.memberId, row);
    }
  }

  return members.map((member) => {
    const user = usersById.get(member.userId);
    const activeGrants = grantsByMember.get(member.id) ?? [];
    const primaryRuntime = activeGrants.length ? runtimesById.get(activeGrants[0].runtimeId) : null;
    const presence = presenceByMember.get(member.id) ?? null;

    return {
      memberId: member.id,
      userId: member.userId,
      displayName: user?.displayName ?? user?.email ?? member.userId,
      role: member.role,
      permissions: member.permissions,
      runtime: primaryRuntime
        ? {
            runtimeId: primaryRuntime.id,
            framework: primaryRuntime.framework,
            provider: primaryRuntime.provider,
            model: primaryRuntime.model,
            status: primaryRuntime.status,
            lastSeenAt: primaryRuntime.lastSeenAt,
          }
        : null,
      activeGrants: activeGrants.map((grant) => ({
        grantId: grant.id,
        scopes: grant.scopes,
        status: grant.status,
        issuedAt: grant.issuedAt,
        expiresAt: grant.expiresAt,
      })),
      presence,
      joinedAt: member.joinedAt,
    };
  });
});

app.post('/v1/projects/:projectId/features', async (request) => {
  const { projectId } = request.params;
  const auth = await requireHostOrRuntime(request, { projectId, scope: 'FEATURE_CREATE' });
  const input = createFeatureSchema.parse(request.body ?? {});
  await getProjectOrThrow(projectId);
  await ensureProjectReference(projectId, 'goal', input.goalId);
  const actorUserId = await actorUserIdFromAuth(projectId, auth, input.createdByUserId);
  const runtimeMetadata = runtimeMetadataFromAuth(auth);

  const feature = await prisma.$transaction(async (tx) => {
    const created = await tx.projectFeature.create({
      data: {
        id: randomUUID(),
        projectId,
        goalId: input.goalId ?? null,
        title: input.title,
        description: input.description ?? null,
        status: 'PLANNED',
        priority: input.priority ?? 0,
        sortOrder: input.sortOrder ?? 0,
        spec: runtimeMetadata
          ? {
              ...(input.spec ?? {}),
              source: input.spec?.source ?? 'agent-runtime',
              agentRuntime: runtimeMetadata,
            }
          : input.spec ?? undefined,
        createdById: actorUserId,
      },
    });

    await appendProjectEvent(tx, {
      projectId,
      type: 'FEATURE_CREATED',
      refType: 'FEATURE',
      refId: created.id,
      actorUserId,
      payload: {
        title: created.title,
        goalId: created.goalId,
        createdBy: runtimeMetadata ? 'agent-runtime' : 'host',
      },
    });

    return created;
  });

  return { featureId: feature.id, feature };
});

app.post('/v1/projects/:projectId/work-items', async (request) => {
  const { projectId } = request.params;
  const auth = await requireHostOrRuntime(request, { projectId, scope: 'WORK_ITEM_CREATE' });
  const input = createWorkItemSchema.parse(request.body ?? {});
  await getProjectOrThrow(projectId);
  await ensureProjectReference(projectId, 'feature', input.featureId);
  await ensureProjectReference(projectId, 'workItem', input.parentWorkItemId);
  const linkedFeature = input.featureId
    ? await prisma.projectFeature.findFirst({
        where: { id: input.featureId, projectId },
        select: { goalId: true },
      })
    : null;
  const goalId = input.goalId ?? linkedFeature?.goalId ?? null;
  await ensureProjectReference(projectId, 'goal', goalId);
  const actorUserId = await actorUserIdFromAuth(projectId, auth, input.createdByUserId);
  const runtimeMetadata = runtimeMetadataFromAuth(auth);

  const workItem = await prisma.$transaction(async (tx) => {
    const created = await tx.projectWorkItem.create({
      data: {
        id: randomUUID(),
        projectId,
        goalId,
        featureId: input.featureId ?? null,
        parentWorkItemId: input.parentWorkItemId ?? null,
        title: input.title,
        description: input.description ?? null,
        workType: input.workType,
        status: 'DRAFT',
        scopeBrief: input.scopeBrief ?? null,
        acceptanceCriteria: input.acceptanceCriteria ?? null,
        inputPacket: runtimeMetadata
          ? {
              ...(input.inputPacket ?? {}),
              source: input.inputPacket?.source ?? 'agent-runtime',
              agentRuntime: runtimeMetadata,
            }
          : input.inputPacket ?? undefined,
        outputContract: input.outputContract ?? undefined,
        dependsOn: input.dependsOn ?? [],
        concurrencyMode: input.concurrencyMode ?? 'SINGLE',
        priority: input.priority ?? 0,
        createdById: actorUserId,
        ownerId: input.ownerId ?? null,
        dueAt: input.dueAt ? new Date(input.dueAt) : null,
      },
    });

    await appendProjectEvent(tx, {
      projectId,
      type: 'WORK_ITEM_CREATED',
      refType: 'WORK_ITEM',
      refId: created.id,
      actorUserId,
      payload: {
        title: created.title,
        featureId: created.featureId,
        workType: created.workType,
        createdBy: runtimeMetadata ? 'agent-runtime' : 'host',
      },
    });

    return created;
  });

  return { workItemId: workItem.id, workItem };
});

app.post('/v1/projects/:projectId/assignments', async (request) => {
  const { projectId } = request.params;
  const auth = await requireHostOrRuntime(request, { projectId, scope: 'ASSIGNMENT_DISPATCH' });
  const input = createAssignmentSchema.parse(request.body ?? {});
  await getProjectOrThrow(projectId);
  const assignedByUserId = await actorUserIdFromAuth(projectId, auth, input.assignedByUserId);

  const [assigneeMember, assignedByUser] = await Promise.all([
    getProjectMemberOrThrow(projectId, input.assigneeMemberId),
    getUserOrThrow(assignedByUserId),
  ]);
  const sourceMemberId = auth.type === 'runtime' ? auth.token.memberId : null;

  const workItem = await prisma.projectWorkItem.findFirst({
    where: { id: input.workItemId, projectId },
  });
  if (!workItem) {
    throw badRequest('Work item not found in project');
  }

  if (input.targetRuntimeId) {
    const runtime = await prisma.agentRuntime.findUnique({ where: { id: input.targetRuntimeId } });
    if (!runtime) {
      throw badRequest('Target runtime not found');
    }
  }

  const assignment = await prisma.$transaction(async (tx) => {
    const createdAssignment = await tx.projectAssignment.create({
      data: {
        id: randomUUID(),
        projectId,
        workItemId: input.workItemId,
        assigneeUserId: assigneeMember.userId,
        assignedByUserId: assignedByUser.id,
        role: input.role,
        status: 'PROPOSED',
        objective: input.objective ?? workItem.title,
        contextPacket: input.contextPacket ?? null,
      },
    });

    await tx.projectWorkItem.update({
      where: { id: input.workItemId },
      data: {
        status: 'ASSIGNED',
        ownerId: assigneeMember.userId,
      },
    });

    const inbox = await createInboxItem(tx, {
      projectId,
      targetMemberId: assigneeMember.id,
      targetRuntimeId: input.targetRuntimeId ?? null,
      sourceMemberId,
      kind: 'ASSIGNMENT_DISPATCH',
      ownerActionType: 'CLAIM_ASSIGNMENT',
      priority: 'HIGH',
      refType: 'ASSIGNMENT',
      refId: createdAssignment.id,
      summary: `Assignment dispatched: ${workItem.title}`,
      details: {
        workItemId: input.workItemId,
        targetRuntimeId: input.targetRuntimeId ?? null,
      },
    });

    await appendProjectEvent(tx, {
      projectId,
      type: 'ASSIGNMENT_CREATED',
      refType: 'ASSIGNMENT',
      refId: createdAssignment.id,
      actorUserId: assignedByUser.id,
      payload: {
        workItemId: input.workItemId,
        assigneeMemberId: assigneeMember.id,
        inboxItemId: inbox.id,
      },
    });

    return { createdAssignment, inbox };
  });

  return {
    assignmentId: assignment.createdAssignment.id,
    status: assignment.createdAssignment.status,
    inboxItemId: assignment.inbox.id,
  };
});

app.post('/v1/runtimes/register', async (request) => {
  const hostKey = getHeaderValue(request, 'x-agent-workspace-host-key');
  const registrationKey = getHeaderValue(request, 'x-agent-workspace-runtime-registration-key');
  if (
    hostKey !== env.AGENT_WORKSPACE_HOST_KEY &&
    registrationKey !== (env.AGENT_WORKSPACE_RUNTIME_REGISTRATION_KEY || env.AGENT_WORKSPACE_HOST_KEY)
  ) {
    throw unauthorized('Invalid runtime registration credentials');
  }

  const input = registerRuntimeSchema.parse(request.body ?? {});
  const runtimeId = input.runtimeId ?? randomUUID();
  const now = new Date();

  const runtime = await prisma.agentRuntime.upsert({
    where: { id: runtimeId },
    update: {
      memberId: input.memberId ?? null,
      provider: input.provider,
      framework: input.framework,
      model: input.model ?? null,
      status: 'READY',
      wakeEndpoint: input.wakeEndpoint ?? null,
      metadata: input.metadata ?? null,
      registeredAt: now,
      lastSeenAt: now,
    },
    create: {
      id: runtimeId,
      memberId: input.memberId ?? null,
      provider: input.provider,
      framework: input.framework,
      model: input.model ?? null,
      status: 'READY',
      wakeEndpoint: input.wakeEndpoint ?? null,
      metadata: input.metadata ?? null,
      registeredAt: now,
      lastSeenAt: now,
    },
  });

  return {
    runtimeId: runtime.id,
    status: runtime.status,
    registeredAt: runtime.registeredAt,
  };
});

app.post('/v1/projects/:projectId/access-grants', async (request) => {
  await requireHost(request);
  const { projectId } = request.params;
  const input = issueGrantSchema.parse(request.body ?? {});
  await getProjectOrThrow(projectId);

  const [member, runtime] = await Promise.all([
    getProjectMemberOrThrow(projectId, input.memberId),
    prisma.agentRuntime.findUnique({ where: { id: input.runtimeId } }),
  ]);

  if (!runtime) {
    throw badRequest('Runtime not found');
  }

  const grant = await prisma.$transaction(async (tx) => {
    const createdGrant = await tx.projectAccessGrant.create({
      data: {
        id: randomUUID(),
        projectId,
        memberId: member.id,
        runtimeId: runtime.id,
        grantType: 'CLOUD_AGENT',
        scopes: input.scopes,
        skillBundleRefs: input.skillBundleRefs ?? [],
        status: 'ACTIVE',
        reason: input.reason ?? null,
        issuedByMemberId: input.issuedByMemberId ?? null,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });

    await appendProjectEvent(tx, {
      projectId,
      type: 'ACCESS_GRANT_ISSUED',
      refType: 'ACCESS_GRANT',
      refId: createdGrant.id,
      actorUserId: null,
      payload: {
        memberId: member.id,
        runtimeId: runtime.id,
        scopes: input.scopes,
      },
    });

    return createdGrant;
  });

  return {
    grantId: grant.id,
    status: grant.status,
    scopes: grant.scopes,
    expiresAt: grant.expiresAt,
  };
});

app.post('/v1/access-grants/:grantId/tokens', async (request) => {
  await requireHost(request);
  const { grantId } = request.params;

  const grant = await prisma.projectAccessGrant.findUnique({ where: { id: grantId } });
  if (!grant) {
    throw notFound('Access grant not found');
  }
  if (grant.status !== 'ACTIVE') {
    throw forbidden('Access grant is not active');
  }
  if (grant.expiresAt && grant.expiresAt <= new Date()) {
    throw forbidden('Access grant has expired');
  }

  const expiresIn = env.AGENT_WORKSPACE_TOKEN_TTL_SECONDS;
  const token = jwt.sign(
    {
      projectId: grant.projectId,
      runtimeId: grant.runtimeId,
      memberId: grant.memberId,
      grantId: grant.id,
      scopes: Array.isArray(grant.scopes) ? grant.scopes : [],
    },
    env.AGENT_WORKSPACE_JWT_SECRET,
    { expiresIn },
  );

  return {
    token,
    tokenType: 'Bearer',
    expiresIn,
    grantId: grant.id,
  };
});

app.post('/v1/runtimes/:runtimeId/resume', async (request) => {
  const { runtimeId } = request.params;
  const input = resumeRuntimeSchema.parse(request.body ?? {});
  const auth = await requireRuntime(request, {
    projectId: input.projectId,
    runtimeId,
  });

  const member = await getProjectMemberOrThrow(input.projectId, auth.token.memberId);

  await prisma.agentRuntime.update({
    where: { id: runtimeId },
    data: { status: 'ACTIVE', lastSeenAt: new Date() },
  });

  const [activeInbox, assignmentRows, eventMax, project, goals, features, workItems] = await Promise.all([
    prisma.projectInboxItem.findMany({
      where: {
        projectId: input.projectId,
        status: { in: ['UNREAD', 'READ', 'ACKED'] },
        OR: [
          { targetRuntimeId: runtimeId },
          { targetMemberId: auth.token.memberId },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
    prisma.projectAssignment.findMany({
      where: {
        projectId: input.projectId,
        assigneeUserId: member.userId,
        status: { in: ['PROPOSED', 'ACTIVE', 'PAUSED'] },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),
    prisma.projectEvent.aggregate({
      where: { projectId: input.projectId },
      _max: { seq: true },
    }),
    prisma.project.findUnique({
      where: { id: input.projectId },
      select: { id: true, name: true, summary: true, brief: true, status: true, visibility: true },
    }),
    prisma.projectGoal.findMany({
      where: { projectId: input.projectId },
      select: { id: true, title: true, description: true, priority: true, status: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      take: 25,
    }),
    prisma.projectFeature.findMany({
      where: { projectId: input.projectId },
      select: { id: true, goalId: true, title: true, description: true, status: true, priority: true, sortOrder: true },
      orderBy: [{ priority: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      take: 25,
    }),
    prisma.projectWorkItem.findMany({
      where: { projectId: input.projectId },
      select: {
        id: true,
        goalId: true,
        featureId: true,
        title: true,
        description: true,
        workType: true,
        status: true,
        priority: true,
        ownerId: true,
      },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 25,
    }),
  ]);

  const threadIds = [...new Set(activeInbox.map((item) => item.threadId).filter(Boolean))];
  const threadSummaries = threadIds.length
    ? await prisma.projectThread.findMany({
        where: { id: { in: threadIds }, projectId: input.projectId },
      })
    : [];

  return {
    projectId: input.projectId,
    runtimeId,
    memberId: auth.token.memberId,
    project,
    boardSnapshot: {
      goalSummaries: goals,
      featureSummaries: features,
      workItemSummaries: workItems,
    },
    activeInbox,
    assignmentSummaries: assignmentRows,
    threadSummaries,
    eventCursor: eventMax._max.seq ?? 0,
  };
});

app.post('/v1/runtimes/:runtimeId/heartbeat', async (request) => {
  const { runtimeId } = request.params;
  const input = heartbeatSchema.parse(request.body ?? {});
  const auth = await requireRuntime(request, {
    projectId: input.projectId,
    runtimeId,
  });

  const now = new Date();
  await prisma.agentRuntime.update({
    where: { id: runtimeId },
    data: {
      status: mapPresence(input.status) === 'ACTIVE' ? 'ACTIVE' : 'IDLE',
      lastSeenAt: now,
    },
  });

  const existingPresence = await prisma.participantPresence.findFirst({
    where: {
      projectId: input.projectId,
      memberId: auth.token.memberId,
      runtimeId,
    },
  });

  if (existingPresence) {
    await prisma.participantPresence.update({
      where: { id: existingPresence.id },
      data: {
        presence: mapPresence(input.status),
        statusMessage: input.message ?? null,
        lastSeenAt: now,
        lastHeartbeatAt: now,
      },
    });
  } else {
    await prisma.participantPresence.create({
      data: {
        id: randomUUID(),
        projectId: input.projectId,
        memberId: auth.token.memberId,
        runtimeId,
        presence: mapPresence(input.status),
        statusMessage: input.message ?? null,
        lastSeenAt: now,
        lastHeartbeatAt: now,
      },
    });
  }

  return {
    accepted: true,
    recordedAt: now.toISOString(),
  };
});

app.get('/v1/projects/:projectId/files', async (request) => {
  const { projectId } = request.params;
  const auth = await requireHostOrRuntime(request, { projectId, scope: 'PROJECT_FILE_READ' });
  const query = projectFileListQuerySchema.parse(request.query ?? {});
  await getProjectOrThrow(projectId);

  const prefix = `${projectStoragePrefix(projectId)}${normalizeProjectFilePath(query.prefix, { allowEmpty: true })}`;
  const client = getProjectStorageClient();
  const config = storageConfig();
  const listInput = {
    bucket: config.bucket,
    prefix,
    maxKeys: query.limit,
    listOnlyOnce: true,
  };
  if (query.cursor) {
    listInput.continuationToken = query.cursor;
  }
  const { data: output } = await client.listObjectsType2({
    ...listInput,
  });
  const q = (query.q || '').trim().toLowerCase();
  const files = (output.Contents || [])
    .map((item) => ({
      path: projectFilePathFromKey(projectId, item.Key || ''),
      key: item.Key,
      size: Number(item.Size || 0),
      lastModified: item.LastModified,
      etag: item.ETag,
      downloadUrl: projectFileDownloadUrlFromPublicBase(item.Key || ''),
    }))
    .filter((item) => item.key && (!q || item.path.toLowerCase().includes(q)));

  return {
    projectId,
    authType: auth.type,
    files,
    nextCursor: output.NextContinuationToken,
    isTruncated: Boolean(output.IsTruncated),
  };
});

app.get('/v1/projects/:projectId/files/read', async (request) => {
  const { projectId } = request.params;
  await requireHostOrRuntime(request, { projectId, scope: 'PROJECT_FILE_READ' });
  const query = projectFilePathQuerySchema.parse(request.query ?? {});
  await getProjectOrThrow(projectId);

  const key = projectStorageKey(projectId, query.path);
  const client = getProjectStorageClient();
  const config = storageConfig();
  const [{ data: head }, { data: object }] = await Promise.all([
    client.headObject({ bucket: config.bucket, key }),
    client.getObjectV2({ bucket: config.bucket, key }),
  ]);
  const buffer = await bodyToBuffer(object.content);
  const contentType = head['content-type'] || 'application/octet-stream';
  const encoding = query.encoding || (isProbablyText(contentType, query.path) ? 'text' : 'base64');

  return {
    projectId,
    path: normalizeProjectFilePath(query.path),
    key,
    size: Number(head['content-length'] || buffer.length),
    contentType,
    lastModified: head['last-modified'],
    encoding,
    content: encoding === 'base64' ? buffer.toString('base64') : buffer.toString('utf8'),
  };
});

app.get('/v1/projects/:projectId/files/download-url', async (request) => {
  const { projectId } = request.params;
  await requireHostOrRuntime(request, { projectId, scope: 'PROJECT_FILE_READ' });
  const query = projectFilePathQuerySchema.parse(request.query ?? {});
  await getProjectOrThrow(projectId);

  const key = projectStorageKey(projectId, query.path);
  const client = getProjectStorageClient();
  const config = storageConfig();
  await client.headObject({ bucket: config.bucket, key });
  const url = client.getPreSignedUrl({
    method: 'GET',
    bucket: config.bucket,
    key,
    expires: query.expiresIn,
  });

  return {
    projectId,
    path: normalizeProjectFilePath(query.path),
    key,
    url,
    expiresIn: query.expiresIn,
  };
});

app.post('/v1/projects/:projectId/files/write', async (request) => {
  const { projectId } = request.params;
  const auth = await requireHostOrRuntime(request, { projectId, scope: 'PROJECT_FILE_WRITE' });
  const input = projectFileWriteSchema.parse(request.body ?? {});
  await getProjectOrThrow(projectId);

  const key = projectStorageKey(projectId, input.path);
  const client = getProjectStorageClient();
  const config = storageConfig();
  const body = input.encoding === 'base64' ? Buffer.from(input.content, 'base64') : Buffer.from(input.content, 'utf8');
  const contentType = input.contentType || (input.encoding === 'base64' ? 'application/octet-stream' : 'text/plain; charset=utf-8');
  await client.putObject({
    bucket: config.bucket,
    key,
    body,
    contentType,
  });

  const actorUserId = await actorUserIdFromAuth(projectId, auth);
  await prisma.$transaction(async (tx) => {
    await appendProjectEvent(tx, {
      projectId,
      type: 'PROJECT_FILE_WRITTEN',
      refType: 'PROJECT_FILE',
      refId: normalizeProjectFilePath(input.path),
      actorUserId,
      payload: { path: normalizeProjectFilePath(input.path), key, size: body.length, contentType },
    });
  });

  return {
    projectId,
    path: normalizeProjectFilePath(input.path),
    key,
    size: body.length,
    contentType,
  };
});

app.post('/v1/projects/:projectId/files/upload', async (request) => {
  const { projectId } = request.params;
  const auth = await requireHostOrRuntime(request, { projectId, scope: 'PROJECT_FILE_WRITE' });
  await getProjectOrThrow(projectId);

  const part = await request.file();
  if (!part) {
    throw badRequest('No file provided');
  }
  const fieldPath = part.fields?.path?.value;
  const filePath = normalizeUploadPath(typeof fieldPath === 'string' ? fieldPath : undefined, part.filename);
  const body = await part.toBuffer();
  const key = projectStorageKey(projectId, filePath);
  const contentType = part.mimetype || 'application/octet-stream';
  const client = getProjectStorageClient();
  const config = storageConfig();
  await client.putObject({
    bucket: config.bucket,
    key,
    body,
    contentType,
  });

  const actorUserId = await actorUserIdFromAuth(projectId, auth);
  await prisma.$transaction(async (tx) => {
    await appendProjectEvent(tx, {
      projectId,
      type: 'PROJECT_FILE_UPLOADED',
      refType: 'PROJECT_FILE',
      refId: filePath,
      actorUserId,
      payload: { path: filePath, key, size: body.length, contentType },
    });
  });

  return {
    projectId,
    path: filePath,
    key,
    size: body.length,
    contentType,
  };
});

app.delete('/v1/projects/:projectId/files', async (request) => {
  const { projectId } = request.params;
  const auth = await requireHostOrRuntime(request, { projectId, scope: 'PROJECT_FILE_WRITE' });
  const query = projectFilePathQuerySchema.parse(request.query ?? {});
  await getProjectOrThrow(projectId);

  const path = normalizeProjectFilePath(query.path);
  const key = projectStorageKey(projectId, path);
  const client = getProjectStorageClient();
  const config = storageConfig();
  await client.deleteObject({ bucket: config.bucket, key });

  const actorUserId = await actorUserIdFromAuth(projectId, auth);
  await prisma.$transaction(async (tx) => {
    await appendProjectEvent(tx, {
      projectId,
      type: 'PROJECT_FILE_DELETED',
      refType: 'PROJECT_FILE',
      refId: path,
      actorUserId,
      payload: { path, key },
    });
  });

  return { projectId, path, key, deleted: true };
});

app.get('/v1/projects/:projectId/inbox', async (request) => {
  const { projectId } = request.params;
  const auth = await requireHostOrRuntime(request, { projectId });
  const querySchema = z.object({
    targetMemberId: z.string().optional(),
    targetRuntimeId: z.string().optional(),
    status: z.string().optional(),
  });
  const query = querySchema.parse(request.query ?? {});

  let where;
  if (auth.type === 'host') {
    where = {
      projectId,
      ...(query.targetMemberId ? { targetMemberId: query.targetMemberId } : {}),
      ...(query.targetRuntimeId ? { targetRuntimeId: query.targetRuntimeId } : {}),
      ...(query.status ? { status: query.status } : {}),
    };
  } else {
    where = {
      projectId,
      status: query.status ?? { in: ['UNREAD', 'READ', 'ACKED'] },
      OR: [
        { targetRuntimeId: auth.token.runtimeId },
        { targetMemberId: auth.token.memberId },
      ],
    };
  }

  return prisma.projectInboxItem.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
});

app.get('/v1/projects/:projectId/threads', async (request) => {
  const { projectId } = request.params;
  await requireHostOrRuntime(request, { projectId });
  const querySchema = z.object({
    refType: z.string().optional(),
    refId: z.string().optional(),
    status: z.string().optional(),
  });
  const query = querySchema.parse(request.query ?? {});

  return prisma.projectThread.findMany({
    where: {
      projectId,
      ...(query.refType ? { refType: query.refType } : {}),
      ...(query.refId ? { refId: query.refId } : {}),
      ...(query.status ? { status: query.status } : {}),
    },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  });
});

app.post('/v1/projects/:projectId/messages', async (request) => {
  const { projectId } = request.params;
  const auth = await requireHostOrRuntime(request, { projectId, scope: 'THREAD_PARTICIPATE' });
  const input = createMessageSchema.parse(request.body ?? {});
  await getProjectOrThrow(projectId);

  const senderMemberId = auth.type === 'runtime' ? auth.token.memberId : input.senderMemberId ?? null;
  const thread = await getThreadForWrite(projectId, input, senderMemberId);

  const created = await prisma.$transaction(async (tx) => {
    const message = await tx.projectMessage.create({
      data: {
        id: randomUUID(),
        projectId,
        threadId: thread.id,
        senderMemberId,
        senderRuntimeId: auth.type === 'runtime' ? auth.token.runtimeId : null,
        messageType: input.messageType,
        visibility: input.visibility,
        targetMemberIds: input.targetMemberIds ?? [],
        mentionMemberIds: input.mentions ?? [],
        body: input.body,
        requiresAck: input.requiresAck,
        metadata: input.metadata ?? null,
      },
    });

    for (const mentionedMemberId of input.mentions ?? []) {
      if (mentionedMemberId === senderMemberId) continue;
      await createInboxItem(tx, {
        projectId,
        targetMemberId: mentionedMemberId,
        sourceMemberId: senderMemberId,
        kind: 'MENTION',
        ownerActionType: 'RESPOND_TO_PEER',
        priority: 'NORMAL',
        refType: 'MESSAGE',
        refId: message.id,
        threadId: thread.id,
        summary: `Mentioned in thread: ${thread.title}`,
      });
    }

    for (const targetMemberId of input.targetMemberIds ?? []) {
      if (targetMemberId === senderMemberId) continue;
      await createInboxItem(tx, {
        projectId,
        targetMemberId,
        sourceMemberId: senderMemberId,
        kind: 'PEER_MESSAGE',
        ownerActionType: 'RESPOND_TO_PEER',
        priority: input.messageType === 'ALERT' ? 'HIGH' : 'NORMAL',
        refType: 'MESSAGE',
        refId: message.id,
        threadId: thread.id,
        summary: input.body.slice(0, 160),
      });
    }

    await appendProjectEvent(tx, {
      projectId,
      type: 'MESSAGE_CREATED',
      refType: 'THREAD',
      refId: thread.id,
      actorUserId: null,
      payload: { messageId: message.id },
    });

    return message;
  });

  return {
    messageId: created.id,
    threadId: created.threadId,
    createdAt: created.createdAt,
  };
});

app.post('/v1/projects/:projectId/proposals', async (request) => {
  const { projectId } = request.params;
  const auth = await requireHostOrRuntime(request, { projectId, scope: 'PROPOSAL_CREATE' });
  const input = createProposalSchema.parse(request.body ?? {});
  await getProjectOrThrow(projectId);

  const creatorMember =
    auth.type === 'runtime'
      ? await getProjectMemberOrThrow(projectId, auth.token.memberId)
      : input.createdByMemberId
        ? await getProjectMemberOrThrow(projectId, input.createdByMemberId)
        : null;

  const creatorUserId = creatorMember?.userId ?? null;
  if (!creatorUserId) {
    throw badRequest('createdByMemberId is required for host proposal creation');
  }

  const approverMembers = await Promise.all(
    input.approverMemberIds.map((memberId) => getProjectMemberOrThrow(projectId, memberId)),
  );

  const proposal = await prisma.$transaction(async (tx) => {
    const createdProposal = await tx.projectProposal.create({
      data: {
        id: randomUUID(),
        projectId,
        type: input.type,
        payload: {
          title: input.title ?? null,
          summary: input.summary ?? null,
          data: input.payload,
        },
        reason: input.reason ?? null,
        createdByUserId: creatorUserId,
        approverUserIds: approverMembers.map((member) => member.userId),
        status: 'PENDING',
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      },
    });

    const inboxItemIds = [];
    for (const approver of approverMembers) {
      const inbox = await createInboxItem(tx, {
        projectId,
        targetMemberId: approver.id,
        sourceMemberId: creatorMember.id,
        kind: 'PROPOSAL',
        ownerActionType: 'APPROVE_PROPOSAL',
        priority: 'HIGH',
        refType: 'PROPOSAL',
        refId: createdProposal.id,
        summary: input.title ?? input.type,
      });
      inboxItemIds.push(inbox.id);
    }

    await appendProjectEvent(tx, {
      projectId,
      type: 'PROPOSAL_CREATED',
      refType: 'PROPOSAL',
      refId: createdProposal.id,
      actorUserId: creatorUserId,
      payload: { inboxItemIds },
    });

    return { createdProposal, inboxItemIds };
  });

  return {
    proposalId: proposal.createdProposal.id,
    status: proposal.createdProposal.status,
    generatedInboxItemIds: proposal.inboxItemIds,
  };
});

app.post('/v1/projects/:projectId/reviews', async (request) => {
  const { projectId } = request.params;
  const auth = await requireHostOrRuntime(request, { projectId, scope: 'REVIEW_SUBMIT' });
  const input = createReviewSchema.parse(request.body ?? {});
  await getProjectOrThrow(projectId);

  const assignment = await prisma.projectAssignment.findFirst({
    where: { id: input.assignmentId, projectId },
  });
  if (!assignment) {
    throw badRequest('Assignment not found in project');
  }

  const reviewerMember =
    auth.type === 'runtime'
      ? await getProjectMemberOrThrow(projectId, auth.token.memberId)
      : input.reviewerMemberId
        ? await getProjectMemberOrThrow(projectId, input.reviewerMemberId)
        : null;

  if (!reviewerMember) {
    throw badRequest('reviewerMemberId is required for host review submission');
  }

  const reviewThread = await prisma.projectThread.findFirst({
    where: {
      projectId,
      refType: 'ASSIGNMENT',
      refId: assignment.id,
      threadType: 'REVIEW',
      status: 'OPEN',
    },
  });

  const review = await prisma.$transaction(async (tx) => {
    const thread =
      reviewThread ??
      (await tx.projectThread.create({
        data: {
          id: randomUUID(),
          projectId,
          threadType: 'REVIEW',
          refType: 'ASSIGNMENT',
          refId: assignment.id,
          title: `Review for assignment ${assignment.id}`,
          status: 'OPEN',
          createdByMemberId: reviewerMember.id,
        },
      }));

    const createdReview = await tx.projectReview.create({
      data: {
        id: randomUUID(),
        projectId,
        workItemId: assignment.workItemId,
        assignmentId: assignment.id,
        artifactId: input.artifactId ?? null,
        reviewerUserId: reviewerMember.userId,
        reviewerType: 'AGENT_WORKSPACE',
        status: input.decision === 'REQUEST_CHANGES' ? 'CHANGES_REQUESTED' : input.decision,
        reviewNote: input.summary ?? null,
        checklistResult: input.details ?? null,
      },
    });

    let generatedInboxItemId = null;
    if (input.decision === 'REQUEST_CHANGES') {
      const assigneeMember = await tx.projectMember.findFirst({
        where: {
          projectId,
          userId: assignment.assigneeUserId,
          removedAt: null,
        },
      });

      if (assigneeMember) {
        const inbox = await createInboxItem(tx, {
          projectId,
          targetMemberId: assigneeMember.id,
          sourceMemberId: reviewerMember.id,
          kind: 'REWORK_REQUEST',
          ownerActionType: 'REVIEW_ARTIFACT',
          priority: 'HIGH',
          refType: 'REVIEW',
          refId: createdReview.id,
          threadId: thread.id,
          summary: input.summary ?? 'Review requested changes',
        });
        generatedInboxItemId = inbox.id;
      }
    }

    await appendProjectEvent(tx, {
      projectId,
      type: 'REVIEW_CREATED',
      refType: 'REVIEW',
      refId: createdReview.id,
      actorUserId: reviewerMember.userId,
      payload: { threadId: thread.id, generatedInboxItemId },
    });

    return { createdReview, generatedInboxItemId };
  });

  return {
    reviewId: review.createdReview.id,
    status: review.createdReview.status,
    generatedInboxItemId: review.generatedInboxItemId,
  };
});

app.post('/v1/projects/:projectId/external-events', async (request) => {
  const { projectId } = request.params;
  await requireIntegrationOrHost(request);
  const input = ingestExternalEventSchema.parse(request.body ?? {});
  await getProjectOrThrow(projectId);

  const assignment = input.relatedAssignmentId
    ? await prisma.projectAssignment.findFirst({
        where: { id: input.relatedAssignmentId, projectId },
      })
    : null;

  const external = await prisma.$transaction(async (tx) => {
    const createdExternal = await tx.externalEvent.create({
      data: {
        id: randomUUID(),
        projectId,
        source: input.source,
        externalEventId: input.externalRef,
        kind: input.type,
        linkedWorkItemId: input.relatedWorkItemId ?? assignment?.workItemId ?? null,
        payload: input.payload,
      },
    });

    const mappedEvent = await appendProjectEvent(tx, {
      projectId,
      type: 'EXTERNAL_EVENT_INGESTED',
      refType: 'EXTERNAL_EVENT',
      refId: createdExternal.id,
      payload: {
        source: input.source,
        kind: input.type,
      },
    });

    await tx.externalEvent.update({
      where: { id: createdExternal.id },
      data: { mappedProjectEventId: mappedEvent.id },
    });

    let generatedInboxItemId = null;
    if (input.type === 'CI_FAILED' && assignment) {
      const assigneeMember = await tx.projectMember.findFirst({
        where: {
          projectId,
          userId: assignment.assigneeUserId,
          removedAt: null,
        },
      });

      if (assigneeMember) {
        const inbox = await createInboxItem(tx, {
          projectId,
          targetMemberId: assigneeMember.id,
          kind: 'CI_INCIDENT',
          ownerActionType: 'FIX_CI',
          priority: 'HIGH',
          refType: 'EXTERNAL_EVENT',
          refId: createdExternal.id,
          summary: `CI failed for assignment ${assignment.id}`,
          details: input.payload,
        });
        generatedInboxItemId = inbox.id;
      }
    }

    return {
      createdExternal,
      mappedEvent,
      generatedInboxItemId,
    };
  });

  return {
    externalEventId: external.createdExternal.id,
    eventId: external.mappedEvent.id,
    generatedInboxItemId: external.generatedInboxItemId,
  };
});

const start = async () => {
  await app.listen({ port: env.PORT, host: env.HOST });
};

const shutdown = async () => {
  await app.close();
  await prisma.$disconnect();
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

start().catch(async (error) => {
  app.log.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
