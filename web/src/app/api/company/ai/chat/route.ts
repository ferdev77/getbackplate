import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/infrastructure/supabase/client/server";
import { assertCompanyManagerModuleApi } from "@/shared/lib/access";
import { logAuditEvent } from "@/shared/lib/audit";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

const MAX_QUESTION_LENGTH = 400;
const REQUEST_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const requestTimestampsByUser = new Map<string, number[]>();

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

async function getFacts(organizationId: string) {
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

function answerWithRules(question: string, facts: Awaited<ReturnType<typeof getFacts>>) {
  const q = question.toLowerCase();
  if (q.includes("emplead") || q.includes("usuario")) {
    return `Hoy tienes ${facts.employeesActive} empleados activos.`;
  }
  if (q.includes("checklist") || q.includes("pendient")) {
    return `Ahora mismo hay ${facts.checklistPending} checklists pendientes de revision.`;
  }
  if (q.includes("document") || q.includes("firma")) {
    return `Tienes ${facts.documentsPending} documentos pendientes (pendientes o rechazados).`;
  }
  if (q.includes("modulo") || q.includes("módulo") || q.includes("habilitado")) {
    if (!facts.enabledModules.length) return "No hay modulos habilitados en este momento.";
    return `Modulos habilitados: ${facts.enabledModules.join(", ")}.`;
  }
  return `Resumen rapido: ${facts.employeesActive} empleados activos, ${facts.checklistPending} checklists pendientes y ${facts.documentsPending} documentos pendientes.`;
}

async function answerWithOpenAi(params: {
  question: string;
  history: ChatMessage[];
  facts: Awaited<ReturnType<typeof getFacts>>;
}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const systemPrompt = [
    "Eres el asistente operativo de GetBackplate para empresas gastronomicas.",
    "Responde siempre en espanol simple, concreto y corto.",
    "No inventes datos. Solo usa los facts entregados.",
    "Si la pregunta no se puede responder con facts, dilo claramente.",
  ].join(" ");

  const factsPrompt = JSON.stringify(params.facts);
  const messages = [
    { role: "system", content: systemPrompt },
    ...params.history,
    {
      role: "user",
      content: `Facts actuales de la organizacion: ${factsPrompt}. Pregunta: ${params.question}`,
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
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) return null;
  return { content, model };
}

async function answerWithOpenRouter(params: {
  question: string;
  history: ChatMessage[];
  facts: Awaited<ReturnType<typeof getFacts>>;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const model = process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini";
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const appName = "GetBackplate AI Assistant";

  const systemPrompt = [
    "Eres el asistente operativo de GetBackplate para empresas gastronomicas.",
    "Responde siempre en espanol simple, concreto y corto.",
    "No inventes datos. Solo usa los facts entregados.",
    "Si la pregunta no se puede responder con facts, dilo claramente.",
  ].join(" ");

  const factsPrompt = JSON.stringify(params.facts);
  const messages = [
    { role: "system", content: systemPrompt },
    ...params.history,
    {
      role: "user",
      content: `Facts actuales de la organizacion: ${factsPrompt}. Pregunta: ${params.question}`,
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
  };
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) return null;
  return { content, model };
}

export async function POST(request: Request) {
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
  const history = normalizeHistory(payload?.history);

  if (!question) {
    return NextResponse.json({ error: "Pregunta invalida" }, { status: 400 });
  }

  const facts = await getFacts(access.tenant.organizationId);
  let answer = answerWithRules(question, facts);
  let mode: "basic" | "basic_ai" | "pro_ai" = "basic";
  let modelUsed: string | null = null;

  if (facts.planCode === "pro") {
    const aiAnswer = await answerWithOpenAi({ question, history, facts }).catch(() => null);
    if (aiAnswer?.content) {
      answer = aiAnswer.content;
      mode = "pro_ai";
      modelUsed = aiAnswer.model;
    } else {
      const fallbackAi = await answerWithOpenRouter({ question, history, facts }).catch(() => null);
      if (fallbackAi?.content) {
        answer = fallbackAi.content;
        mode = "basic_ai";
        modelUsed = fallbackAi.model;
      }
    }
  } else if (facts.planCode === "basico") {
    const basicAi = await answerWithOpenRouter({ question, history, facts }).catch(() => null);
    if (basicAi?.content) {
      answer = basicAi.content;
      mode = "basic_ai";
      modelUsed = basicAi.model;
    }
  }

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
      model: modelUsed,
      question_preview: question.slice(0, 120),
      plan_code: facts.planCode,
    },
  });

  return NextResponse.json({
    answer,
    mode,
    planCode: facts.planCode,
    planName: facts.planName,
    hasRealAi: mode === "pro_ai",
  });
}
