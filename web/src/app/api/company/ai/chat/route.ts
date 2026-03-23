import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyManagerModuleApi } from "@/shared/lib/access";
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
  checklistPending: number;
  documentsPending: number;
  enabledModules: string[];
  planCode: string | null;
  planName: string | null;
};

type AiResult = {
  content: string;
  model: string;
  provider: "openai" | "openrouter";
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type CachedAnswer = {
  answer: string;
  mode: AssistantMode;
  confidence: Confidence;
  provider: "openai" | "openrouter" | "structured";
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

const requestTimestampsByUser = new Map<string, number[]>();
const faqCache = new Map<string, CachedAnswer>();
const sessionMemoryByKey = new Map<string, SessionMemory>();

function applyRateLimit(userId: string) {
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
  if (q.includes("emplead") || q.includes("usuario")) return "employees";
  if (q.includes("checklist") || q.includes("pendient")) return "checklists";
  if (q.includes("document") || q.includes("firma")) return "documents";
  if (q.includes("modulo") || q.includes("módulo") || q.includes("habilitado")) return "modules";
  if (q.includes("resumen") || q.includes("ejecut") || q.includes("general")) return "executive";
  return "general";
}

function detectComplexity(question: string): Complexity {
  const q = question.toLowerCase();
  const complexSignals = [
    "compar",
    "tendencia",
    "analiza",
    "analisis",
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
    "Responde siempre en espanol simple, concreto y corto.",
    "No inventes datos. Solo usa los facts entregados.",
    "Formato obligatorio: Resumen / Dato clave / Siguiente accion.",
  ];

  if (intent === "employees") return ["Enfoca en fuerza laboral y personal.", ...shared].join(" ");
  if (intent === "checklists") return ["Enfoca en pendientes operativos y cumplimiento.", ...shared].join(" ");
  if (intent === "documents") return ["Enfoca en estado de documentos y riesgo operativo.", ...shared].join(" ");
  if (intent === "modules") return ["Enfoca en modulos activos y alcance funcional.", ...shared].join(" ");
  if (intent === "executive") return ["Responde como resumen ejecutivo accionable.", ...shared].join(" ");
  return ["Responde con resumen operativo general.", ...shared].join(" ");
}

function buildSystemPrompt(params: {
  roleCode: string;
  originModule: string;
  intent: AssistantIntent;
}) {
  return [
    "Eres el asistente operativo de GetBackplate para empresas gastronomicas.",
    `Rol de quien pregunta: ${params.roleCode}.`,
    `Modulo origen: ${params.originModule}.`,
    `Intencion detectada: ${params.intent}.`,
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
  if (!normalized.includes("resumen") || !normalized.includes("dato clave") || !normalized.includes("siguiente accion")) {
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

function getCachedAnswer(cacheKey: string) {
  const cached = faqCache.get(cacheKey);
  if (!cached) return null;
  if (Date.now() - cached.createdAt > FAQ_CACHE_TTL_MS) {
    faqCache.delete(cacheKey);
    return null;
  }
  return cached;
}

function setCachedAnswer(cacheKey: string, answer: Omit<CachedAnswer, "createdAt">) {
  faqCache.set(cacheKey, {
    ...answer,
    createdAt: Date.now(),
  });
}

function getSessionMemoryKey(organizationId: string, userId: string) {
  return `${organizationId}:${userId}`;
}

function getSessionMemory(memoryKey: string, incomingHistory: ChatMessage[]) {
  const existing = sessionMemoryByKey.get(memoryKey);
  if (!existing) return incomingHistory.slice(-SESSION_MEMORY_MAX_TURNS * 2);
  if (Date.now() - existing.updatedAt > SESSION_MEMORY_TTL_MS) {
    sessionMemoryByKey.delete(memoryKey);
    return incomingHistory.slice(-SESSION_MEMORY_MAX_TURNS * 2);
  }
  if (!incomingHistory.length) return existing.messages;
  return incomingHistory.slice(-SESSION_MEMORY_MAX_TURNS * 2);
}

function setSessionMemory(memoryKey: string, history: ChatMessage[]) {
  sessionMemoryByKey.set(memoryKey, {
    updatedAt: Date.now(),
    messages: history.slice(-SESSION_MEMORY_MAX_TURNS * 2),
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

  const [
    { count: employeesActive },
    { count: checklistPending },
    { count: documentsPending },
    { data: enabledModulesRows },
    { data: organizationPlan },
  ] = await Promise.all([
    supabase
      .from("employees")
      .select("id", { head: true, count: "exact" })
      .eq("organization_id", organizationId)
      .eq("status", "active"),
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
    checklistPending: checklistPending ?? 0,
    documentsPending: documentsPending ?? 0,
    enabledModules,
    planCode: plan?.code ?? null,
    planName: plan?.name ?? null,
  };
}

function answerWithRules(question: string, facts: Facts) {
  const q = question.toLowerCase();
  if (q.includes("emplead") || q.includes("usuario")) {
    return [
      `Resumen: hoy tienes ${facts.employeesActive} empleados activos.`,
      `Dato clave: plantilla activa = ${facts.employeesActive}.`,
      "Siguiente accion: revisa altas pendientes o ausencias del dia para ajustar operacion.",
    ].join("\n");
  }
  if (q.includes("checklist") || q.includes("pendient")) {
    return [
      `Resumen: hay ${facts.checklistPending} checklists pendientes de revision.`,
      `Dato clave: pendientes actuales = ${facts.checklistPending}.`,
      "Siguiente accion: prioriza sucursales con mayor atraso y cierra incidencias primero.",
    ].join("\n");
  }
  if (q.includes("document") || q.includes("firma")) {
    return [
      `Resumen: tienes ${facts.documentsPending} documentos pendientes (pendientes o rechazados).`,
      `Dato clave: documentos en riesgo = ${facts.documentsPending}.`,
      "Siguiente accion: contacta responsables y completa firmas criticas hoy.",
    ].join("\n");
  }
  if (q.includes("modulo") || q.includes("módulo") || q.includes("habilitado")) {
    const modulesLabel = facts.enabledModules.length ? facts.enabledModules.join(", ") : "ninguno";
    return [
      `Resumen: modulos habilitados = ${modulesLabel}.`,
      `Dato clave: total modulos activos = ${facts.enabledModules.length}.`,
      "Siguiente accion: valida que los equipos usen solo modulos habilitados para tu plan.",
    ].join("\n");
  }
  return [
    `Resumen: ${facts.employeesActive} empleados activos, ${facts.checklistPending} checklists pendientes y ${facts.documentsPending} documentos pendientes.`,
    `Dato clave: plan actual = ${facts.planName ?? facts.planCode ?? "sin plan"}.`,
    "Siguiente accion: decide si quieres profundizar en empleados, checklists, documentos o modulos.",
  ].join("\n");
}

async function callOpenAi(params: {
  question: string;
  history: ChatMessage[];
  facts: Facts;
  roleCode: string;
  originModule: string;
  intent: AssistantIntent;
  complexity: Complexity;
  forceQualityPrompt?: boolean;
}): Promise<AiResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model =
    params.complexity === "complex"
      ? process.env.OPENAI_MODEL_COMPLEX ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini"
      : process.env.OPENAI_MODEL_FAST ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const systemPrompt = buildSystemPrompt({
    roleCode: params.roleCode,
    originModule: params.originModule,
    intent: params.intent,
  });

  const qualityPrompt = params.forceQualityPrompt
    ? "Mejora la claridad y respeta exactamente el formato Resumen / Dato clave / Siguiente accion."
    : "";

  const factsPrompt = JSON.stringify(params.facts);
  const messages = [
    { role: "system", content: systemPrompt },
    ...params.history,
    {
      role: "user",
      content: `Facts actuales de la organizacion: ${factsPrompt}. Pregunta: ${params.question}. ${qualityPrompt}`,
    },
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      messages,
    }),
  });

  if (!response.ok) return null;
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) return null;
  const usage = data.usage;
  return {
    content,
    model,
    provider: "openai",
    inputTokens: usage?.prompt_tokens ?? estimateTokens(JSON.stringify(messages)),
    outputTokens: usage?.completion_tokens ?? estimateTokens(content),
    totalTokens:
      usage?.total_tokens ??
      (usage?.prompt_tokens ?? estimateTokens(JSON.stringify(messages))) +
        (usage?.completion_tokens ?? estimateTokens(content)),
  };
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
  const appName = "GetBackplate AI Assistant";

  const systemPrompt = buildSystemPrompt({
    roleCode: params.roleCode,
    originModule: params.originModule,
    intent: params.intent,
  });

  const qualityPrompt = params.forceQualityPrompt
    ? "Mejora la claridad y respeta exactamente el formato Resumen / Dato clave / Siguiente accion."
    : "";

  const factsPrompt = JSON.stringify(params.facts);
  const messages = [
    { role: "system", content: systemPrompt },
    ...params.history,
    {
      role: "user",
      content: `Facts actuales de la organizacion: ${factsPrompt}. Pregunta: ${params.question}. ${qualityPrompt}`,
    },
  ];

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
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) return null;
  const usage = data.usage;
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
  const access = await assertCompanyManagerModuleApi("ai_assistant");
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  if (!applyRateLimit(access.userId)) {
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
    return NextResponse.json({ error: "Pregunta invalida" }, { status: 400 });
  }

  if (isSensitiveQuestion(question)) {
    return NextResponse.json({
      answer:
        "Resumen: no puedo responder esa consulta por seguridad.\nDato clave: la pregunta incluye datos sensibles o fuera de alcance.\nSiguiente accion: formula una consulta operativa (empleados, checklists, documentos o modulos).\n\n(Modo estructurado)\nConfianza: alto",
      mode: "basic",
      confidence: "alto",
      hasRealAi: false,
    });
  }

  const facts = await getFacts(access.tenant.organizationId);
  const intent = detectIntent(question);
  const complexity = detectComplexity(question);

  const memoryKey = getSessionMemoryKey(access.tenant.organizationId, access.userId);
  const history = getSessionMemory(memoryKey, incomingHistory);

  const canUseFaqCache = history.length <= 1;
  const cacheKey = buildFaqCacheKey({
    organizationId: access.tenant.organizationId,
    planCode: facts.planCode,
    intent,
    question,
  });

  if (canUseFaqCache) {
    const cached = getCachedAnswer(cacheKey);
    if (cached) {
      const assistantMessage: ChatMessage = { role: "assistant", content: cached.answer };
      setSessionMemory(memoryKey, [...history, { role: "user", content: question }, assistantMessage]);
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
  let provider: "openai" | "openrouter" | "structured" = "structured";
  let modelUsed: string | null = null;
  let inputTokens = estimateTokens(question);
  let outputTokens = estimateTokens(answer);
  let totalTokens = inputTokens + outputTokens;

  if (facts.planCode === "pro") {
    const openAiResult = await withQualityRetry(
      () =>
        callOpenAi({
          question,
          history,
          facts,
          roleCode: access.tenant.roleCode,
          originModule,
          intent,
          complexity,
        }),
      () =>
        callOpenAi({
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

    if (openAiResult?.content) {
      answer = openAiResult.content;
      mode = "pro_ai";
      confidence = "alto";
      provider = "openai";
      modelUsed = openAiResult.model;
      inputTokens = openAiResult.inputTokens;
      outputTokens = openAiResult.outputTokens;
      totalTokens = openAiResult.totalTokens;
    } else {
      const openRouterFallback = await withQualityRetry(
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

      if (openRouterFallback?.content) {
        answer = openRouterFallback.content;
        mode = "basic_ai";
        confidence = "medio";
        provider = "openrouter";
        modelUsed = openRouterFallback.model;
        inputTokens = openRouterFallback.inputTokens;
        outputTokens = openRouterFallback.outputTokens;
        totalTokens = openRouterFallback.totalTokens;
      }
    }
  } else if (facts.planCode === "basico") {
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
    }
  }

  const assistantMessage: ChatMessage = { role: "assistant", content: answer };
  setSessionMemory(memoryKey, [...history, { role: "user", content: question }, assistantMessage]);

  if (canUseFaqCache) {
    setCachedAnswer(cacheKey, {
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
        provider === "structured" ? 0 : Number((totalTokens * (provider === "openai" ? 0.0000015 : 0.0000012)).toFixed(6)),
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
