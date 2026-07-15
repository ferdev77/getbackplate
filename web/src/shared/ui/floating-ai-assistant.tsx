"use client";

import { useEffect, useMemo, useState } from "react";
import { Bot, Send, Sparkles, X } from "lucide-react";
import { usePathname } from "next/navigation";

type Message = {
  role: "user" | "assistant";
  content: string;
};

type FloatingAiAssistantProps = {
  currentPlanCode: string | null;
  userName: string;
  tenantId: string;
  userKey: string;
};

export function FloatingAiAssistant({ currentPlanCode, userName, tenantId, userKey }: FloatingAiAssistantProps) {
  const pathname = usePathname();
  const isEmployeesPage = pathname.startsWith("/app/employees");
  const launcherBottomClass = isEmployeesPage ? "bottom-[66px]" : "bottom-[34px]";
  const panelBottomClass = isEmployeesPage ? "bottom-[132px]" : "bottom-24";
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const storageKey = useMemo(() => `gb.ai.conversation.${tenantId}.${userKey || "anon"}`, [tenantId, userKey]);
  const displayName = userName.trim().split(/\s+/)[0] || "";
  const planIntro = currentPlanCode === "pro"
    ? "I can help you with advanced analysis and operational questions."
    : "I can help you with operational questions about your account.";
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
       content: `Hello${displayName ? ` ${displayName}` : ""}, I am your AI assistant. ${planIntro} How can I help you today?`,
    },
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(storageKey);
    setConversationId(stored ? stored.slice(0, 80) : null);
  }, [storageKey]);

  function syncConversationId(nextId: string | null) {
    setConversationId(nextId);
    if (typeof window === "undefined") return;
    if (!nextId) {
      window.localStorage.removeItem(storageKey);
      return;
    }
    window.localStorage.setItem(storageKey, nextId);
  }

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
          conversationId,
          originModule: pathname,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        answer?: string;
        error?: string;
        mode?: "basic" | "basic_ai" | "pro_ai";
        confidence?: "alto" | "medio" | "bajo";
        conversationId?: string | null;
      };

      if (data.conversationId && data.conversationId !== conversationId) {
        syncConversationId(data.conversationId);
      }

      if (!response.ok) {
        const statusHint = response.status === 429
          ? "The per-minute question limit has been reached."
          : response.status === 403
            ? "You do not have permission to use the AI assistant in this module."
            : response.status === 402
              ? "The AI module is not enabled for your current plan."
              : null;
        throw new Error(statusHint || "Your question could not be processed.");
      }

      const suffix =
        data.mode === "pro_ai"
          ? "\n\n(Pro AI mode)"
          : data.mode === "basic_ai"
            ? "\n\n(Modo OpenRouter)"
            : "\n\n(Structured mode)";
      const confidence = data.confidence ? `\nConfidence: ${data.confidence}` : "";
      setMessages((prev) => [...prev, { role: "assistant", content: `${data.answer ?? "No response"}${suffix}${confidence}` }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Your question could not be processed.";
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
        AI Assistant
      </button>

      {open ? (
        <section className={`fixed right-5 z-50 flex h-[520px] w-[360px] flex-col overflow-hidden rounded-2xl border border-[var(--gbp-border)] bg-[var(--gbp-surface)] shadow-2xl ${panelBottomClass}`}>
          <header className="flex items-center justify-between border-b border-[var(--gbp-border)] px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[var(--gbp-violet)]" />
              <p className="text-sm font-semibold text-[var(--gbp-text)]">AI Assistant</p>
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
            {loading ? <p className="text-xs text-[var(--gbp-text2)]">Thinking...</p> : null}
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
                placeholder="Ask me something about your operations"
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
