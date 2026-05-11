"use client";

import { useEffect, useState, FormEvent } from "react";
import { Plus, Edit3, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthGate } from "@/lib/useAuthGate";
import { AdminShell } from "@/components/AdminShell";
import { useDialog } from "@/components/Dialog";
import {
  PageHeader,
  Modal,
  Field,
  inputCls,
  btnPrimary,
  btnGhost,
  btnDanger,
  SectionTitle,
} from "@/components/Modal";

interface Faq {
  id: string;
  question: string;
  answer: string;
  category: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function FaqAdminPage() {
  const { user, loading } = useAuthGate();
  const dialog = useDialog();
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Faq | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await api.get<{ faqs: Faq[] }>("/admin/faqs");
    setFaqs(res.faqs);
  };

  useEffect(() => {
    if (user) void load();
  }, [user]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      question: String(fd.get("question") || "").trim(),
      answer: String(fd.get("answer") || "").trim(),
      category: String(fd.get("category") || "").trim() || undefined,
      sort_order: Number(fd.get("sort_order") || 0),
      is_active: fd.get("is_active") === "on",
    };
    try {
      if (editing) {
        await api.patch(`/admin/faqs/${editing.id}`, body);
      } else {
        await api.post("/admin/faqs", body);
      }
      setOpen(false);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      await dialog.alert({ title: "Save failed", message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (f: Faq) => {
    const ok = await dialog.confirm({
      title: `Delete this FAQ?`,
      message: f.question,
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/faqs/${f.id}`);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      await dialog.alert({ title: "Delete failed", message, tone: "danger" });
    }
  };

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="font-script text-2xl text-[var(--gold-dark)]">Bless</p>
      </div>
    );
  }

  // Group by category for nicer display.
  const grouped = new Map<string, Faq[]>();
  for (const f of faqs) {
    const key = f.category?.trim() || "General";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(f);
  }

  return (
    <AdminShell user={user}>
      <PageHeader
        title="FAQ"
        subtitle="Customer-facing questions and answers grouped by category."
      />

      <div className="mb-6 flex justify-between items-center">
        <SectionTitle hint="Visible on the storefront /faq page. Sort order controls display order within each category.">
          Entries
        </SectionTitle>
        <button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          className={btnPrimary}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New FAQ
        </button>
      </div>

      <div className="space-y-8">
        {[...grouped.entries()].map(([category, list]) => (
          <section key={category}>
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-luxe text-[var(--gold-dark)]">
              {category}
            </p>
            <div className="bg-white" style={{ border: "1px solid var(--line)", borderRadius: 4 }}>
              {list
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((f) => (
                  <div
                    key={f.id}
                    className="flex gap-4 px-5 py-4"
                    style={{ borderTop: "1px solid var(--line-soft)" }}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-medium">{f.question}</p>
                        {!f.is_active && (
                          <span className="badge badge-mute">Hidden</span>
                        )}
                      </div>
                      <p className="text-sm text-[var(--ink-light)] whitespace-pre-wrap">
                        {f.answer}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 items-start gap-1">
                      <button
                        onClick={() => {
                          setEditing(f);
                          setOpen(true);
                        }}
                        title="Edit"
                        aria-label="Edit"
                        className="flex h-8 w-8 items-center justify-center rounded-sm text-[var(--ink-muted)] transition-colors hover:bg-[var(--cream-dark)] hover:text-[var(--gold-dark)]"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => onDelete(f)}
                        title="Delete"
                        aria-label="Delete"
                        className="flex h-8 w-8 items-center justify-center rounded-sm text-[var(--ink-muted)] transition-colors hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </section>
        ))}
        {faqs.length === 0 && (
          <div className="py-16 text-center">
            <p className="font-display text-2xl text-[var(--ink-muted)]">No FAQs yet</p>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              Click &ldquo;New FAQ&rdquo; to add your first question.
            </p>
          </div>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit FAQ" : "New FAQ"}
        footer={
          <>
            <button onClick={() => setOpen(false)} className={btnGhost}>Cancel</button>
            <button form="faq-form" type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <form id="faq-form" onSubmit={onSubmit} className="space-y-4">
          <Field label="Question" required>
            <input
              name="question"
              required
              defaultValue={editing?.question || ""}
              className={inputCls}
              placeholder="How long does shipping take?"
            />
          </Field>
          <Field label="Answer" required>
            <textarea
              name="answer"
              required
              defaultValue={editing?.answer || ""}
              rows={6}
              className={inputCls}
              placeholder="Standard shipping arrives in 5–7 business days…"
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category" hint="Group on the storefront FAQ page.">
              <input
                name="category"
                defaultValue={editing?.category || ""}
                className={inputCls}
                placeholder="Shipping"
              />
            </Field>
            <Field label="Sort order" hint="Lower numbers appear first.">
              <input
                type="number"
                name="sort_order"
                defaultValue={editing?.sort_order ?? 0}
                className={inputCls}
              />
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={editing ? editing.is_active : true}
              className="h-4 w-4 accent-[var(--gold-dark)]"
            />
            Active (visible to customers)
          </label>
        </form>
      </Modal>
    </AdminShell>
  );
}
