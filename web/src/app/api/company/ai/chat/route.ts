import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyAdminModuleApi } from "@/shared/lib/access";
import {
  applySharedRateLimit,
  deleteSharedRuntimeValue,
  getSharedRuntimeValue,
  setSharedRuntimeValue,
} from "@/shared/lib/ai-runtime-store";
import { logAuditEvent } from "@/shared/lib/audit";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type AssistantIntent = "employees" | "checklists" | "documents" | "modules" | "executive" | "general";
type Complexity = "simple" | "complex";
type Confidence = "alto" | "medio" | "bajo";
type AssistantMode = "basic" | "basic_ai" | "pro_ai";

type Facts = {
  employeesActive: number;
  employeesTotal: number;
  usersActive: number;
  branchesActive: number;
  departmentsActive: number;
  positionsActive: number;
  documentsTotal: number;
  foldersTotal: number;
  checklistTemplatesTotal: number;
  checklistRunsTotal: number;
  checklistPending: number;
  documentsPending: number;
  announcementsActive: number;
  announcementsFeatured: number;
  announcementsExpiringSoon: number;
  latestAnnouncementTitle: string | null;
  latestAnnouncementDate: string | null;
  latestDocumentName: string | null;
  latestChecklistTemplate: string | null;
  enabledModules: string[];
  planCode: string | null;
  planName: string | null;
};

type AiResult = {
  content: string;
  model: string;
  provider: "anthropic" | "openrouter";
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type CachedAnswer = {
  answer: string;
  mode: AssistantMode;
  confidence: Confidence;
  provider: "anthropic" | "openrouter" | "structured";
  model: string | null;
  createdAt: number;
};

type SessionMemory = {
  updatedAt: number;
  messages: ChatMessage[];
};

const MAX_QUESTION_LENGTH = 400;
const REQUEST_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const SESSION_MEMORY_TTL_MS = 30 * 60 * 1000;
const SESSION_MEMORY_MAX_TURNS = 6;
const FAQ_CACHE_TTL_MS = 90 * 1000;
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

const requestTimestampsByUser = new Map<string, number[]>();
const faqCache = new Map<string, CachedAnswer>();
const sessionMemoryByKey = new Map<string, SessionMemory>();

async function applyRateLimit(userId: string) {
  const shared = await applySharedRateLimit({
    userId,
    windowMs: REQUEST_WINDOW_MS,
    maxRequests: MAX_REQUESTS_PER_WINDOW,
  });
  if (typeof shared === "boolean") {
    return shared;
  }

  const now = Date.now();
  const existing = requestTimestampsByUser.get(userId) ?? [];
  const fresh = existing.filter((timestamp) => now - timestamp < REQUEST_WINDOW_MS);
  if (fresh.length >= MAX_REQUESTS_PER_WINDOW) return false;
  fresh.push(now);
  requestTimestampsByUser.set(userId, fresh);
  return true;
}

function normalizeQuestion(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  return value.slice(0, MAX_QUESTION_LENGTH);
}

function normalizeHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const role = (row as Record<string, unknown>).role;
      const content = (row as Record<string, unknown>).content;
      if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null;
      return {
        role,
        content: content.slice(0, 500),
      } as ChatMessage;
    })
    .filter((row): row is ChatMessage => Boolean(row))
    .slice(-8);
}

function detectIntent(question: string): AssistantIntent {
  const q = question.toLowerCase();
  if (q.includes("emplead") || q.includes("usuario") || q.includes("admin") || q.includes("administrador")) return "employees";
  if (q.includes("checklist") || q.includes("pendient")) return "checklists";
  if (q.includes("document") || q.includes("firma") || q.includes("carpeta")) return "documents";
  if (q.includes("aviso") || q.includes("anuncio") || q.includes("publicacion") || q.includes("publicación")) return "executive";
  if (q.includes("modulo") || q.includes("módulo") || q.includes("habilitado") || q.includes("plan") || q.includes("configur")) return "modules";
  if (q.includes("sucursal") || q.includes("departamento") || q.includes("puesto") || q.includes("reporte")) return "executive";
  if (q.includes("resumen") || q.includes("ejecut") || q.includes("general")) return "executive";
  return "general";
}

function detectComplexity(question: string): Complexity {
  const q = question.toLowerCase();
  const complexSignals = [
    "compar",
    "tendencia",
    "analiza",
    "análisis",
    "estrateg",
    "recomend",
    "impacto",
    "causa",
    "por que",
  ];
  if (question.length > 140) return "complex";
  if (complexSignals.some((signal) => q.includes(signal))) return "complex";
  return "simple";
}

function buildDomainPrompt(intent: AssistantIntent) {
  const shared = [
    "Responde siempre en español simple, concreto y corto.",
    "No inventes datos. Solo usa los facts entregados.",
    "Formato obligatorio: Resumen / Dato clave / Siguiente acción.",
  ];

  if (intent === "employees") return ["Enfoca en fuerza laboral y personal.", ...shared].join(" ");
  if (intent === "checklists") return ["Enfoca en pendientes operativos y cumplimiento.", ...shared].join(" ");
  if (intent === "documents") return ["Enfoca en estado de documentos y riesgo operativo.", ...shared].join(" ");
  if (intent === "modules") return ["Enfoca en módulos activos y alcance funcional.", ...shared].join(" ");
  if (intent === "executive") return ["Responde como resumen ejecutivo accionable.", ...shared].join(" ");
  return ["Responde con resumen operativo general.", ...shared].join(" ");
}

function buildSystemPrompt(params: {
  roleCode: string;
  originModule: string;
  intent: AssistantIntent;
}) {
  return [
    "Eres el asistente operativo de la empresa para operaciones gastronómicas.",
    `Rol de quien pregunta: ${params.roleCode}.`,
    `Módulo origen: ${params.originModule}.`,
    `Intención detectada: ${params.intent}.`,
    buildDomainPrompt(params.intent),
    "Si la pregunta no se puede responder con facts, dilo claramente.",
  ].join(" ");
}

function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4));
}

function hasLowQualityAnswer(answer: string, intent: AssistantIntent) {
  const normalized = answer.trim().toLowerCase();
  if (!normalized) return true;
  if (normalized.length < 40) return true;
  if (!normalized.includes("resumen") || !normalized.includes("dato clave") || !normalized.includes("siguiente acción")) {
    return true;
  }
  if (intent !== "general" && normalized.includes("no tengo informacion")) {
    return true;
  }
  return false;
}

function normalizeFaqQuestion(question: string) {
  return question.toLowerCase().replace(/\s+/g, " ").trim();
}

function buildFaqCacheKey(params: { organizationId: string; planCode: string | null; intent: AssistantIntent; question: string }) {
  return `${params.organizationId}::${params.planCode ?? "none"}::${params.intent}::${normalizeFaqQuestion(params.question)}`;
}

async function getCachedAnswer(cacheKey: string) {
  const shared = await getSharedRuntimeValue<CachedAnswer>("faq", cacheKey);
  if (shared) {
    return shared;
  }

  const cached = faqCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > FAQ_CACHE_TTL_MS) {
    faqCache.delete(cacheKey);
    return null;
  }
  return cached;
}

async function setCachedAnswer(cacheKey: string, answer: Omit<CachedAnswer, "createdAt">) {
  const next = {
    ...answer,
    createdAt: Date.now(),
  };

  faqCache.set(cacheKey, next);
  await setSharedRuntimeValue({
    scope: "faq",
    key: cacheKey,
    value: next,
    ttlSeconds: Math.ceil(FAQ_CACHE_TTL_MS / 1000),
  });
}

function getSessionMemoryKey(organizationId: string, userId: string) {
  return `${organizationId}:${userId}`;
}

async function getSessionMemory(memoryKey: string, incomingHistory: ChatMessage[]) {
  const shared = await getSharedRuntimeValue<SessionMemory>("session", memoryKey);
  if (shared) {
    if (!incomingHistory.length) {
      return shared.messages;
    }
    return incomingHistory.slice(-SESSION_MEMORY_MAX_TURNS * 2);
  }

  const existing = sessionMemoryByKey.get(memoryKey);
  if (!existing) return incomingHistory.slice(-SESSION_MEMORY_MAX_TURNS * 2);
  if (Date.now() - existing.updatedAt > SESSION_MEMORY_TTL_MS) {
    sessionMemoryByKey.delete(memoryKey);
    await deleteSharedRuntimeValue("session", memoryKey);
    return incomingHistory.slice(-SESSION_MEMORY_MAX_TURNS * 2);
  }
  if (!incomingHistory.length) return existing.messages;
  return incomingHistory.slice(-SESSION_MEMORY_MAX_TURNS * 2);
}

async function setSessionMemory(memoryKey: string, history: ChatMessage[]) {
  const payload = {
    updatedAt: Date.now(),
    messages: history.slice(-SESSION_MEMORY_MAX_TURNS * 2),
  };

  sessionMemoryByKey.set(memoryKey, payload);
  await setSharedRuntimeValue({
    scope: "session",
    key: memoryKey,
    value: payload,
    ttlSeconds: Math.ceil(SESSION_MEMORY_TTL_MS / 1000),
  });
}

function isSensitiveQuestion(question: string) {
  const q = question.toLowerCase();
  const blocked = [
    "password",
    "contrasena",
    "contraseña",
    "token",
    "api key",
    "clave privada",
    "cbu",
    "dni",
    "domicilio exacto",
    "telefono personal",
    "correo personal",
    "otra organizacion",
    "otra empresa",
  ];
  return blocked.some((word) => q.includes(word));
}

async function getFacts(organizationId: string): Promise<Facts> {
  const supabase = await createSupabaseServerClient();
  const nowIso = new Date().toISOString();
  const soon = new Date();
  soon.setDate(soon.getDate() + 7);
  const soonIso = soon.toISOString();

  const [
    { count: employeesActive },
    { count: employeesTotal },
    { count: usersActive },
    { count: branchesActive },
    { count: departmentsActive },
    { count: positionsActive },
    { count: documentsTotal },
    { count: foldersTotal },
    { count: checklistTemplatesTotal },
    { count: checklistRunsTotal },
    { count: checklistPending },
    { count: documentsPending },
    { count: announcementsActive },
    { count: announcementsFeatured },
    { count: announcementsExpiringSoon },
    { data: latestAnnouncement },
    { data: latestDocument },
    { data: latestChecklistTemplate },
    { data: enabledModulesRows },
    { data: organizationPlan },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id", { head: true, count: "exact" })
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    supabase
      .from("employees")
      .select("id", { head: true, count: "exact" })
      .eq("organization_id", organizationId),
    supabase
      .from("memberships")
      .select("id", { head: true, count: "exact" })
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    supabase
      .from("branches")
      .select("id", { head: true, count: "exact" })
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    supabase
      .from("organization_departments")
      .select("id", { head: true, count: "exact" })
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    supabase
      .from("department_positions")
      .select("id", { head: true, count: "exact" })
      .eq("organization_id", organizationId)
      .eq("is_active", true),
    supabase
      .from("documents")
      .select("id", { head: true, count: "exact" })
.is('deleted_at', null)
      .eq("organization_id", organizationId),
    supabase
      .from("document_folders")
      .select("id", { head: true, count: "exact" })
      .eq("organization_id", organizationId),
    supabase
      .from("checklist_templates")
      .select("id", { head: true, count: "exact" })
      .eq("organization_id", organizationId),
    supabase
      .from("checklist_submissions")
      .select("id", { head: true, count: "exact" })
      .eq("organization_id", organizationId),
    supabase
      .from("checklist_submissions")
      .select("id", { head: true, count: "exact" })
      .eq("organization_id", organizationId)
      .eq("status", "submitted"),
    supabase
      .from("employee_documents")
      .select("document_id", { head: true, count: "exact" })
      .eq("organization_id", organizationId)
      .in("status", ["pending", "rejected"]),
    supabase
      .from("announcements")
      .select("id", { head: true, count: "exact" })
      .eq("organization_id", organizationId),
    supabase
      .from("announcements")
      .select("id", { head: true, count: "exact" })
      .eq("organization_id", organizationId)
      .eq("is_featured", true),
    supabase
      .from("announcements")
      .select("id", { head: true, count: "exact" })
      .eq("organization_id", organizationId)
      .not("expires_at", "is", null)
      .gte("expires_at", nowIso)
      .lte("expires_at", soonIso),
    supabase
      .from("announcements")
      .select("title, publish_at")
      .eq("organization_id", organizationId)
      .order("publish_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("documents")
      .select("title, created_at")
.is('deleted_at', null)
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("checklist_templates")
      .select("name, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("organization_modules")
      .select("module_catalog!inner(code)")
      .eq("organization_id", organizationId)
      .eq("is_enabled", true),
    supabase
      .from("organizations")
      .select("plans(code, name)")
      .eq("id", organizationId)
      .maybeSingle(),
  ]);

  const enabledModules = (enabledModulesRows ?? [])
    .map((row) => {
      const moduleCatalog = row.module_catalog as { code?: string } | null;
      return moduleCatalog?.code ?? "";
    })
    .filter(Boolean)
    .sort();

  const plan = organizationPlan?.plans as { code?: string; name?: string } | null;

  return {
    employeesActive: employeesActive ?? 0,
    employeesTotal: employeesTotal ?? 0,
    usersActive: usersActive ?? 0,
    branchesActive: branchesActive ?? 0,
    departmentsActive: departmentsActive ?? 0,
    positionsActive: positionsActive ?? 0,
    documentsTotal: documentsTotal ?? 0,
    foldersTotal: foldersTotal ?? 0,
    checklistTemplatesTotal: checklistTemplatesTotal ?? 0,
    checklistRunsTotal: checklistRunsTotal ?? 0,
    checklistPending: checklistPending ?? 0,
    documentsPending: documentsPending ?? 0,
    announcementsActive: announcementsActive ?? 0,
    announcementsFeatured: announcementsFeatured ?? 0,
    announcementsExpiringSoon: announcementsExpiringSoon ?? 0,
    latestAnnouncementTitle: latestAnnouncement?.title ?? null,
    latestAnnouncementDate: latestAnnouncement?.publish_at ?? null,
    latestDocumentName: latestDocument?.title ?? null,
    latestChecklistTemplate: latestChecklistTemplate?.name ?? null,
    enabledModules,
    planCode: plan?.code ?? null,
    planName: plan?.name ?? null,
  };
}

function answerWithRules(question: string, facts: Facts) {
  const q = question.toLowerCase();
  if (q.includes("todo") || q.includes("toda la info") || q.includes("panorama completo") || q.includes("estado general")) {
    return [
      `Resumen: empleados activos ${facts.employeesActive}/${facts.employeesTotal}, usuarios activos ${facts.usersActive}, checklists pendientes ${facts.checklistPending}, documentos pendientes ${facts.documentsPending}, avisos ${facts.announcementsActive}.`,
      `Dato clave: sucursales ${facts.branchesActive}, departamentos ${facts.departmentsActive}, puestos ${facts.positionsActive}, plantillas checklist ${facts.checklistTemplatesTotal}, ejecuciones checklist ${facts.checklistRunsTotal}.`,
      `Siguiente acción: pide detalle por módulo (empleados, documentos, checklists, avisos, módulos, plan) para bajar a nivel operativo.${facts.latestAnnouncementTitle ? ` Último aviso: ${facts.latestAnnouncementTitle}.` : ""}`,
    ].join("\n");
  }
  if (q.includes("emplead") || q.includes("usuario")) {
    return [
      `Resumen: hoy tienes ${facts.employeesActive} empleados activos y ${facts.usersActive} usuarios activos en total.`,
      `Dato clave: total de empleados registrados = ${facts.employeesTotal}.`,
      "Siguiente acción: revisa altas pendientes o ausencias del día para ajustar operación.",
    ].join("\n");
  }
  if (q.includes("checklist") || q.includes("pendient")) {
    return [
      `Resumen: hay ${facts.checklistPending} checklists pendientes de revisión.`,
      `Dato clave: pendientes actuales = ${facts.checklistPending}.`,
      "Siguiente acción: prioriza sucursales con mayor atraso y cierra incidencias primero.",
    ].join("\n");
  }
  if (q.includes("document") || q.includes("firma")) {
    return [
      `Resumen: tienes ${facts.documentsPending} documentos pendientes (pendientes o rechazados).`,
      `Dato clave: documentos en riesgo = ${facts.documentsPending}.`,
      "Siguiente acción: contacta responsables y completa firmas críticas hoy.",
    ].join("\n");
  }
  if (q.includes("modulo") || q.includes("módulo") || q.includes("habilitado")) {
    const modulesLabel = facts.enabledModules.length ? facts.enabledModules.join(", ") : "ninguno";
    return [
      `Resumen: módulos habilitados = ${modulesLabel}.`,
      `Dato clave: total módulos activos = ${facts.enabledModules.length}.`,
      "Siguiente acción: valida que los equipos usen solo módulos habilitados para tu plan.",
    ].join("\n");
  }
  if (q.includes("sucursal") || q.includes("departamento") || q.includes("puesto")) {
    return [
      `Resumen: tienes ${facts.branchesActive} sucursales activas, ${facts.departmentsActive} departamentos activos y ${facts.positionsActive} puestos activos.`,
      `Dato clave: estructura operativa actual = ${facts.branchesActive}/${facts.departmentsActive}/${facts.positionsActive}.`,
      "Siguiente acción: valida cobertura por sucursal y departamentos con mayor carga.",
    ].join("\n");
  }
  if (q.includes("plan") || q.includes("pricing") || q.includes("facturacion") || q.includes("facturación")) {
    return [
      `Resumen: plan actual = ${facts.planName ?? facts.planCode ?? "sin plan"}.`,
      `Dato clave: módulos habilitados = ${facts.enabledModules.length}.`,
      "Siguiente acción: evalúa upgrade si necesitas más automatización o más capacidad.",
    ].join("\n");
  }
  if (q.includes("reporte") || q.includes("resumen")) {
    return [
      `Resumen: empleados activos ${facts.employeesActive}, checklists pendientes ${facts.checklistPending}, documentos pendientes ${facts.documentsPending}, avisos ${facts.announcementsActive}.`,
      `Dato clave: checklists corridos ${facts.checklistRunsTotal}, plantillas ${facts.checklistTemplatesTotal}, documentos ${facts.documentsTotal}, carpetas ${facts.foldersTotal}.`,
      "Siguiente acción: pide un análisis puntual por área para priorizar acción operativa.",
    ].join("\n");
  }
  if (q.includes("aviso") || q.includes("anuncio") || q.includes("publicacion") || q.includes("publicación")) {
    return [
      `Resumen: tienes ${facts.announcementsActive} avisos creados en total.`,
      `Dato clave: fijados = ${facts.announcementsFeatured}, por vencer en 7 días = ${facts.announcementsExpiringSoon}${facts.latestAnnouncementTitle ? `, último aviso = ${facts.latestAnnouncementTitle}` : ""}.`,
      "Siguiente acción: revisa avisos por vencer y prioriza los que impactan operación diaria.",
    ].join("\n");
  }
  return [
    `Resumen: ${facts.employeesActive} empleados activos, ${facts.checklistPending} checklists pendientes, ${facts.documentsPending} documentos pendientes y ${facts.announcementsActive} avisos creados.`,
    `Dato clave: plan actual = ${facts.planName ?? facts.planCode ?? "sin plan"}.`,
    `Siguiente acción: decide si quieres profundizar en empleados, checklists, documentos, módulos, sucursales o reportes${facts.latestDocumentName ? ` (último documento: ${facts.latestDocumentName})` : ""}.`,
  ].join("\n");
}

/**
 * Llama a la API de Anthropic usando el SDK oficial (@anthropic-ai/sdk).
 *
 * Ventajas sobre fetch manual:
 * - Tipado completo: errores, respuestas y parámetros están completamente tipados.
 * - Manejo automático de reintentos y timeouts del SDK.
 * - Sin necesidad de gestionar cabeceras HTTP ni serialización manual.
 * - Compatible con el patrón de streaming si se requiere en el futuro.
 *
 * Modelo configurado vía .env:
 *   ANTHROPIC_API_KEY  → clave secreta de Anthropic
 *   ANTHROPIC_MODEL    → alias o versión exacta (ej: "claude-sonnet-4-6")
 */
async function callAnthropic(params: {
  question: string;
  history: ChatMessage[];
  facts: Facts;
  roleCode: string;
  originModule: string;
  intent: AssistantIntent;
  forceQualityPrompt?: boolean;
}): Promise<AiResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const model = process.env.ANTHROPIC_MODEL ?? DEFAULT_ANTHROPIC_MODEL;

  const systemPrompt = buildSystemPrompt({
    roleCode: params.roleCode,
    originModule: params.originModule,
    intent: params.intent,
  });

  const qualityPrompt = params.forceQualityPrompt
    ? "Mejora la claridad y respeta exactamente el formato Resumen / Dato clave / Siguiente acción."
    : "";

  const factsPrompt = JSON.stringify(params.facts, null, 2);
  const messages: Anthropic.MessageParam[] = [
    ...params.history.map((m) => ({ role: m.role, content: m.content } as Anthropic.MessageParam)),
    {
      role: "user",
      content: `Facts actuales de la organización: ${factsPrompt}. Pregunta: ${params.question}. ${qualityPrompt}`,
    },
  ];

  try {
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
      model,
      max_tokens: 700,
      temperature: 0.2,
      system: systemPrompt,
      messages,
    });

    const textBlock = response.content.find((block) => block.type === "text");
    const content = textBlock && textBlock.type === "text" ? textBlock.text?.trim() : null;
    if (!content) return null;

    const inputTokens = response.usage?.input_tokens ?? estimateTokens(JSON.stringify(messages));
    const outputTokens = response.usage?.output_tokens ?? estimateTokens(content);

    return {
      content,
      model: response.model ?? model,
      provider: "anthropic",
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
  } catch {
    // El SDK lanza APIError, AuthenticationError, RateLimitError, etc.
    // Retornamos null para que el sistema haga fallback a OpenRouter.
    return null;
  }
}

async function callOpenRouter(params: {
  question: string;
  history: ChatMessage[];
  facts: Facts;
  roleCode: string;
  originModule: string;
  intent: AssistantIntent;
  complexity: Complexity;
  forceQualityPrompt?: boolean;
}): Promise<AiResult | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const model =
    params.complexity === "complex"
      ? process.env.OPENROUTER_MODEL_COMPLEX ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini"
      : process.env.OPENROUTER_MODEL_FAST ?? process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";

  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const appName = "Operations AI Assistant";

  const systemPrompt = buildSystemPrompt({
    roleCode: params.roleCode,
    originModule: params.originModule,
    intent: params.intent,
  });

  const qualityPrompt = params.forceQualityPrompt
    ? "Mejora la claridad y respeta exactamente el formato Resumen / Dato clave / Siguiente acción."
    : "";

  const factsPrompt = JSON.stringify(params.facts);
  const messages = [
    { role: "system", content: systemPrompt },
    ...params.history,
    {
      role: "user",
      content: `Facts actuales de la organización: ${factsPrompt}. Pregunta: ${params.question}. ${qualityPrompt}`,
    },
  ];

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": siteUrl,
        "X-Title": appName,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages,
      }),
    });

    if (!response.ok) return null;
    const data = (await response.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: string | null } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    } | null;
    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) return null;
    const usage = data?.usage;
    return {
      content,
      model,
      provider: "openrouter",
      inputTokens: usage?.prompt_tokens ?? estimateTokens(JSON.stringify(messages)),
      outputTokens: usage?.completion_tokens ?? estimateTokens(content),
      totalTokens:
        usage?.total_tokens ??
        (usage?.prompt_tokens ?? estimateTokens(JSON.stringify(messages))) +
          (usage?.completion_tokens ?? estimateTokens(content)),
    };
  } catch {
    return null;
  }
}

async function withQualityRetry(call: () => Promise<AiResult | null>, retry: () => Promise<AiResult | null>, intent: AssistantIntent) {
  const first = await call();
  if (!first) return null;
  if (!hasLowQualityAnswer(first.content, intent)) return first;
  const second = await retry();
  return second ?? first;
}

export async function POST(request: Request) {
  const startedAt = Date.now();
  const access = await assertCompanyAdminModuleApi("ai_assistant");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  if (!(await applyRateLimit(access.userId))) {
    return NextResponse.json(
      { error: "Demasiadas consultas seguidas. Espera un minuto e intenta de nuevo." },
      { status: 429 },
    );
  }

  const payload = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const question = normalizeQuestion(payload?.question);
  const incomingHistory = normalizeHistory(payload?.history);
  const originModule = String(payload?.originModule ?? "company_panel").trim().slice(0, 60) || "company_panel";

  if (!question) {
    return NextResponse.json({ error: "Pregunta inválida" }, { status: 400 });
  }

  if (isSensitiveQuestion(question)) {
    return NextResponse.json({
      answer:
        "Resumen: no puedo responder esa consulta por seguridad.\nDato clave: la pregunta incluye datos sensibles o fuera de alcance.\nSiguiente acción: formula una consulta operativa (empleados, checklists, documentos o módulos).\n\n(Modo estructurado)\nConfianza: alto",
      mode: "basic",
      confidence: "alto",
      hasRealAi: false,
    });
  }

  const facts = await getFacts(access.tenant.organizationId);
  const intent = detectIntent(question);
  const complexity = detectComplexity(question);

  const memoryKey = getSessionMemoryKey(access.tenant.organizationId, access.userId);
  const history = await getSessionMemory(memoryKey, incomingHistory);

  const canUseFaqCache = history.length <= 1;
  const cacheKey = buildFaqCacheKey({
    organizationId: access.tenant.organizationId,
    planCode: facts.planCode,
    intent,
    question,
  });

  if (canUseFaqCache) {
    const cached = await getCachedAnswer(cacheKey);
    if (cached) {
      const assistantMessage: ChatMessage = { role: "assistant", content: cached.answer };
      await setSessionMemory(memoryKey, [...history, { role: "user", content: question }, assistantMessage]);
      await logAuditEvent({
        action: "ai_assistant.chat.query",
        entityType: "ai_assistant",
        organizationId: access.tenant.organizationId,
        branchId: access.tenant.branchId,
        eventDomain: "settings",
        outcome: "success",
        severity: "low",
        metadata: {
          mode: cached.mode,
          confidence: cached.confidence,
          provider: cached.provider,
          model: cached.model,
          intent,
          complexity,
          origin_module: originModule,
          duration_ms: Date.now() - startedAt,
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
          estimated_cost_usd: 0,
          question_preview: question.slice(0, 120),
          plan_code: facts.planCode,
          cached: true,
        },
      });
      return NextResponse.json({
        answer: cached.answer,
        mode: cached.mode,
        confidence: cached.confidence,
        planCode: facts.planCode,
        planName: facts.planName,
        hasRealAi: cached.mode !== "basic",
        provider: cached.provider,
        model: cached.model,
        cached: true,
      });
    }
  }

  let answer = answerWithRules(question, facts);
  let mode: AssistantMode = "basic";
  let confidence: Confidence = intent === "general" ? "medio" : "alto";
  let provider: "anthropic" | "openrouter" | "structured" = "structured";
  let modelUsed: string | null = null;
  let inputTokens = estimateTokens(question);
  let outputTokens = estimateTokens(answer);
  let totalTokens = inputTokens + outputTokens;

  const openRouterResult = await withQualityRetry(
    () =>
      callOpenRouter({
        question,
        history,
        facts,
        roleCode: access.tenant.roleCode,
        originModule,
        intent,
        complexity,
      }),
    () =>
      callOpenRouter({
        question,
        history,
        facts,
        roleCode: access.tenant.roleCode,
        originModule,
        intent,
        complexity,
        forceQualityPrompt: true,
      }),
    intent,
  );

  if (openRouterResult?.content) {
    answer = openRouterResult.content;
    mode = "basic_ai";
    confidence = intent === "general" ? "medio" : "alto";
    provider = "openrouter";
    modelUsed = openRouterResult.model;
    inputTokens = openRouterResult.inputTokens;
    outputTokens = openRouterResult.outputTokens;
    totalTokens = openRouterResult.totalTokens;
  } else {
    const anthropicResult = await withQualityRetry(
      () =>
        callAnthropic({
          question,
          history,
          facts,
          roleCode: access.tenant.roleCode,
          originModule,
          intent,
        }),
      () =>
        callAnthropic({
          question,
          history,
          facts,
          roleCode: access.tenant.roleCode,
          originModule,
          intent,
          forceQualityPrompt: true,
        }),
      intent,
    );

    if (anthropicResult?.content) {
      answer = anthropicResult.content;
      mode = "pro_ai";
      confidence = "alto";
      provider = "anthropic";
      modelUsed = anthropicResult.model;
      inputTokens = anthropicResult.inputTokens;
      outputTokens = anthropicResult.outputTokens;
      totalTokens = anthropicResult.totalTokens;
    }
  }

  const assistantMessage: ChatMessage = { role: "assistant", content: answer };
  await setSessionMemory(memoryKey, [...history, { role: "user", content: question }, assistantMessage]);

  if (canUseFaqCache) {
    await setCachedAnswer(cacheKey, {
      answer,
      mode,
      confidence,
      provider,
      model: modelUsed,
    });
  }

  const durationMs = Date.now() - startedAt;

  await logAuditEvent({
    action: "ai_assistant.chat.query",
    entityType: "ai_assistant",
    organizationId: access.tenant.organizationId,
    branchId: access.tenant.branchId,
    eventDomain: "settings",
    outcome: "success",
    severity: "low",
    metadata: {
      mode,
      confidence,
      provider,
      model: modelUsed,
      intent,
      complexity,
      origin_module: originModule,
      duration_ms: durationMs,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      estimated_cost_usd:
        provider === "structured"
          ? 0
          : Number((totalTokens * (provider === "anthropic" ? 0.0000022 : 0.0000012)).toFixed(6)),
      question_preview: question.slice(0, 120),
      plan_code: facts.planCode,
      cached: false,
    },
  });

  return NextResponse.json({
    answer,
    mode,
    confidence,
    planCode: facts.planCode,
    planName: facts.planName,
    hasRealAi: mode !== "basic",
    provider,
    model: modelUsed,
    durationMs,
    cached: false,
  });
}
