"use client";

import { useState } from "react";
import { Bot, Send, Sparkles, X } from "lucide-react";
import { usePathname } from "next/navigation";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type FloatingAiAssistantProps = {
  currentPlanCode: string | null;
  userName: string;
};

export function FloatingAiAssistant({ currentPlanCode, userName }: FloatingAiAssistantProps) {
  const pathname = usePathname();
  const isEmployeesPage = pathname.startsWith("/app/employees");
  const launcherBottomClass = isEmployeesPage ? "bottom-[66px]" : "bottom-[34px]";
  const panelBottomClass = isEmployeesPage ? "bottom-[132px]" : "bottom-24";
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const displayName = userName.trim().split(/\s+/)[0] || "";
  const planIntro = currentPlanCode === "pro"
    ? "Puedo ayudarte con análisis y consultas avanzadas de tu operación."
    : "Puedo ayudarte con consultas operativas de tu cuenta.";
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: `Hola${displayName ? ` ${displayName}` : ""}, soy tu asistente IA. ${planIntro} ¿En qué puedo ayudarte hoy?`,
    },
  ]);

  async function sendQuestion() {
    const question = input.trim();
    if (!question || loading) return;

    const nextMessages = [...messages, { role: "user", content: question } as Message];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/company/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          history: nextMessages.slice(-8),
          originModule: pathname,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        answer?: string;
        error?: string;
        mode?: "basic" | "basic_ai" | "pro_ai";
        confidence?: "alto" | "medio" | "bajo";
      };

      if (!response.ok) {
        throw new Error(data.error || "No pude procesar tu consulta");
      }

      const suffix =
        data.mode === "pro_ai"
          ? "\n\n(Modo IA Pro)"
          : data.mode === "basic_ai"
            ? "\n\n(Modo OpenRouter)"
            : "\n\n(Modo estructurado)";
      const confidence = data.confidence ? `\nConfianza: ${data.confidence}` : "";
      setMessages((prev) => [...prev, { role: "assistant", content: `${data.answer ?? "Sin respuesta"}${suffix}${confidence}` }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No pude procesar tu consulta";
      setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${message}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`fixed right-5 z-50 inline-flex items-center gap-2 rounded-full bg-[var(--gbp-violet)] px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[var(--gbp-violet-hover)] ${launcherBottomClass}`}
      >
        <Bot className="h-4 w-4" />
        Asistente IA
      </button>

      {open ? (
        <section className={`fixed right-5 z-50 flex h-[520px] w-[360px] flex-col overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-2xl ${panelBottomClass}`}>
          <header className="flex items-center justify-between border-b border-[var(--gbp-border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--gbp-violet)]" />
              <p className="text-sm font-semibold text-[var(--gbp-text)]">Asistente IA</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-[var(--gbp-text2)] hover:bg-[var(--gbp-surface2)]">
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={`max-w-[90%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  message.role === "user"
                    ? "ml-auto bg-[var(--gbp-violet)] text-white"
                    : "bg-[var(--gbp-bg)] text-[var(--gbp-text)]"
                }`}
              >
                {message.content}
              </article>
            ))}
            {loading ? <p className="text-xs text-[var(--gbp-text2)]">Consultando...</p> : null}
          </div>

          <footer className="border-t border-[var(--gbp-border)] p-3">
            <div className="flex items-center gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void sendQuestion();
                  }
                }}
                placeholder="Pregúntame algo sobre tu operación"
                className="h-10 flex-1 rounded-lg border border-[var(--gbp-border2)] bg-[var(--gbp-surface)] px-3 text-sm text-[var(--gbp-text)] outline-none focus:border-[var(--gbp-violet)]"
              />
              <button
                type="button"
                onClick={() => void sendQuestion()}
                disabled={loading}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--gbp-violet)] text-white hover:bg-[var(--gbp-violet-hover)] disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </footer>
        </section>
      ) : null}
    </>
  );
}
