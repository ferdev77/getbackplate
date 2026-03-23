"use client";

import { useState } from "react";
import { Bot, Send, Sparkles, X } from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type FloatingAiAssistantProps = {
  currentPlanCode: string | null;
};

export function FloatingAiAssistant({ currentPlanCode }: FloatingAiAssistantProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        currentPlanCode === "pro"
          ? "Hola, soy tu asistente IA. Preguntame por empleados, checklists, documentos o modulos."
          : "Hola, soy tu asistente. En este plan respondo consultas operativas basicas con datos reales.",
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
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        answer?: string;
        error?: string;
        mode?: "basic" | "basic_ai" | "pro_ai";
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
      setMessages((prev) => [...prev, { role: "assistant", content: `${data.answer ?? "Sin respuesta"}${suffix}` }]);
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
        className="fixed right-5 bottom-5 z-50 inline-flex items-center gap-2 rounded-full bg-[#111] px-4 py-3 text-sm font-semibold text-white shadow-lg transition hover:bg-[#222]"
      >
        <Bot className="h-4 w-4" />
        Asistente IA
      </button>

      {open ? (
        <section className="fixed right-5 bottom-24 z-50 flex h-[520px] w-[360px] flex-col overflow-hidden rounded-2xl border border-[#e5ddd8] bg-white shadow-2xl">
          <header className="flex items-center justify-between border-b border-[#eee] px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#d97706]" />
              <p className="text-sm font-semibold text-[#333]">Asistente IA</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-[#666] hover:bg-[#f2f2f2]">
              <X className="h-4 w-4" />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={`max-w-[90%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                  message.role === "user"
                    ? "ml-auto bg-[#111] text-white"
                    : "bg-[#f6f6f6] text-[#333]"
                }`}
              >
                {message.content}
              </article>
            ))}
            {loading ? <p className="text-xs text-[#8a817b]">Consultando...</p> : null}
          </div>

          <footer className="border-t border-[#eee] p-3">
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
                placeholder="Preguntame algo sobre tu operacion"
                className="h-10 flex-1 rounded-lg border border-[#ddd] px-3 text-sm outline-none focus:border-[#888]"
              />
              <button
                type="button"
                onClick={() => void sendQuestion()}
                disabled={loading}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#111] text-white disabled:opacity-50"
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
