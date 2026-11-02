import { useState, useEffect, useRef, FormEvent } from "react";
import { X, Sparkles, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { askCopilotChat, type ChatTurn } from "../lib/api";
import { useLanguage } from "../lib/language";

/**
 * Simple chat modal that talks to the backend copilot endpoint.
 * All messages are rendered as plain text to satisfy the security policy.
 */
interface ChatModalProps {
  open: boolean;
  onClose: () => void;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  grounded?: boolean;
  service?: string;
}

export default function ChatModal({ open, onClose }: ChatModalProps) {
  const { t } = useTranslation("translation");
  const { lang } = useLanguage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [slowBackend, setSlowBackend] = useState(false);
  const [serviceId, setServiceId] = useState<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (typeof scrollRef.current?.scrollTo === "function") {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [messages, loading, slowBackend]);

  useEffect(() => () => {
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    const question = input.trim();
    const history: ChatTurn[] = messages.map(({ role, content }) => ({ role, content }));
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);
    // Free-tier backend may need ~60s to wake; say so before the user leaves.
    if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    slowTimerRef.current = setTimeout(() => setSlowBackend(true), 6_000);
    try {
      // The shared API helper carries the recent turns so follow-up questions
      // keep their service context; nothing is stored server-side.
      const data = await askCopilotChat(question, history, lang, serviceId);
      const answer = typeof data?.answer === "string" && data.answer.trim() ? data.answer : t("chat.error");
      if (data?.service_id) setServiceId(data.service_id);
      const service = lang === "bn" ? data?.service_name_bn : data?.service_name_en;
      const botMsg: ChatMessage = {
        role: "assistant",
        content: answer,
        grounded: data?.grounded,
        service: service ?? undefined,
      };
      setMessages((prev) => [...prev, botMsg]);
    } catch (err) {
      setMessages((prev) => [...prev, { role: "assistant", content: t("chat.error") }]);
    } finally {
      setLoading(false);
      setSlowBackend(false);
      if (slowTimerRef.current) clearTimeout(slowTimerRef.current);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{t("chat.title")}</h2>
          <button onClick={onClose} aria-label={t("chat.close")} className="p-1 rounded hover:bg-gray-100">
            <X size={20} />
          </button>
        </div>
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 && (
            <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              <Sparkles size={16} className="mb-1 text-indigo-700" aria-hidden="true" />
              {t("chat.intro")}
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={msg.role === "user" ? "text-right" : "text-left"}>
              {msg.role === "assistant" && msg.service ? (
                <p className="mb-1 text-[11px] font-semibold text-indigo-700">{msg.service}</p>
              ) : null}
              <span className={
                msg.role === "user"
                  ? "inline-block whitespace-pre-wrap bg-blue-600 text-white rounded px-3 py-1"
                  : "inline-block whitespace-pre-wrap bg-gray-200 text-gray-800 rounded px-3 py-1"
              }>
                {msg.content}
              </span>
              {msg.role === "assistant" && msg.grounded ? (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-emerald-700">
                  <ShieldCheck size={12} aria-hidden="true" /> {t("chat.grounded")}
                </p>
              ) : null}
            </div>
          ))}
          {loading && (
            <div className="text-left">
              <span className="inline-block bg-gray-200 text-gray-800 rounded px-3 py-1">{t("chat.thinking")}…</span>
            </div>
          )}
          {loading && slowBackend && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-[12px] text-amber-800">
              {t("chat.waking")}
            </div>
          )}
        </div>
        <form onSubmit={sendMessage} className="p-4 border-t flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("chat.placeholder")}
            className="flex-1 border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700 disabled:opacity-50"
          >
            {t("chat.send")}
          </button>
        </form>
      </div>
    </div>
  );
}

