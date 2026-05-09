"use client";

import { useState, FormEvent } from "react";
import { Sparkles, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";

export function AiAdvisory({
  topic,
  context,
  defaultQuestion,
  helperHint,
}: {
  topic: "inventory" | "finance" | "campaign" | "general";
  context: Record<string, unknown>;
  defaultQuestion?: string;
  helperHint?: string;
}) {
  const [text, setText] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState(defaultQuestion || "");

  const onAsk = async (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ text: string; model: string }>("/admin/ai/advise", {
        topic,
        question: question || undefined,
        context,
      });
      setText(res.text);
      setModel(res.model);
    } catch (err: unknown) {
      const e = err as { message?: string; status?: number };
      setError(
        e.status === 503
          ? "Set GOOGLE_AI_API_KEY in backend/shop/.env to enable AI advisory."
          : e.message || "Failed"
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="bg-white"
      style={{
        border: "1px solid var(--line)",
        borderRadius: 4,
        borderLeft: "3px solid var(--gold)",
      }}
    >
      <div className="px-5 pt-4 pb-3" style={{ borderBottom: "1px solid var(--line-soft)" }}>
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[var(--gold-dark)]" />
          <p className="text-[11px] font-semibold uppercase tracking-luxe text-[var(--gold-dark)]">
            AI Advisory
          </p>
          {model && (
            <span className="ml-auto font-mono text-[9px] text-[var(--ink-muted)]">
              {model}
            </span>
          )}
        </div>
        {helperHint && <p className="mt-1.5 text-xs text-[var(--ink-muted)]">{helperHint}</p>}
      </div>

      <div className="px-5 py-4">
        <form onSubmit={onAsk} className="flex gap-2 mb-4">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={defaultQuestion || "Ask anything about this data…"}
            className="input flex-1"
          />
          <button type="submit" disabled={busy} className="btn-gold">
            {busy ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Ask"}
          </button>
        </form>

        {error && (
          <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        {!text && !error && !busy && (
          <p className="text-xs italic text-[var(--ink-muted)]">
            Click <span className="font-medium not-italic text-[var(--gold-dark)]">Ask</span> to
            generate insights from the current data.
          </p>
        )}

        {text && (
          <div
            className="prose prose-sm max-w-none"
            style={{ color: "var(--ink-light)" }}
            dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(text) }}
          />
        )}
      </div>
    </div>
  );
}

// Tiny markdown renderer (headings, bold, lists, paragraphs) so we don't
// pull in a markdown lib for one component.
function simpleMarkdownToHtml(md: string): string {
  const escape = (s: string) =>
    s.replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
    );
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  const flushList = () => {
    if (inList) { out.push("</ul>"); inList = false; }
  };
  const inline = (s: string) =>
    escape(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--ink)">$1</strong>')
      .replace(/`([^`]+)`/g, '<code style="background:var(--cream);padding:1px 4px;border-radius:2px;font-size:0.85em">$1</code>');
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) { flushList(); continue; }
    const h = /^(#{1,6})\s+(.*)/.exec(line);
    if (h) {
      flushList();
      const level = Math.min(h[1].length + 1, 6);
      out.push(
        `<h${level} style="font-family:'Cormorant Garamond',serif;color:var(--ink);font-weight:600;margin:1em 0 0.4em;letter-spacing:0.02em;">${inline(h[2])}</h${level}>`
      );
      continue;
    }
    const li = /^[-*]\s+(.*)/.exec(line);
    if (li) {
      if (!inList) { out.push('<ul style="margin:0.4em 0 0.6em 1.1em;list-style:disc;">'); inList = true; }
      out.push(`<li style="margin:0.2em 0;">${inline(li[1])}</li>`);
      continue;
    }
    flushList();
    out.push(`<p style="margin:0.5em 0;line-height:1.55;">${inline(line)}</p>`);
  }
  flushList();
  return out.join("\n");
}
