"use client";

import { useEffect, useState, FormEvent } from "react";
import { Star, Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthGate } from "@/lib/useAuthGate";
import type { Review } from "@/lib/types";
import { AdminShell } from "@/components/AdminShell";
import { useDialog } from "@/components/Dialog";
import { Pagination } from "@/components/Pagination";
import {
  Modal,
  Field,
  PageHeader,
  inputCls,
  btnPrimary,
  btnGhost,
  btnDanger,
} from "@/components/Modal";

const FILTERS = ["pending", "approved", "rejected", "all"] as const;
type Filter = (typeof FILTERS)[number];

export default function ReviewsPage() {
  const { user, loading } = useAuthGate();
  const dialog = useDialog();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [count, setCount] = useState(0);
  const [filter, setFilter] = useState<Filter>("pending");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = async () => {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String((page - 1) * pageSize),
    });
    if (filter !== "all") params.set("status", filter);
    const res = await api.get<{ reviews: Review[]; count: number }>(
      `/admin/reviews?${params.toString()}`
    );
    setReviews(res.reviews);
    setCount(res.count);
  };

  useEffect(() => {
    if (user) void load();
  }, [user, filter, page, pageSize]);

  useEffect(() => { setPage(1); }, [filter]);

  const onUpdateStatus = async (r: Review, status: Review["status"]) => {
    await api.patch(`/admin/reviews/${r.id}`, { status });
    await load();
  };

  const onDelete = async (r: Review) => {
    const ok = await dialog.confirm({
      title: "Delete this review?",
      message: (
        <>
          “{r.title}” by{" "}
          <span className="font-medium">{r.customer_name || r.customer_email || "anonymous"}</span>
        </>
      ),
      tone: "danger",
      confirmLabel: "Delete review",
    });
    if (!ok) return;
    await api.delete(`/admin/reviews/${r.id}`);
    await load();
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    if (!editing) return;
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api.patch(`/admin/reviews/${editing.id}`, {
        admin_response: String(fd.get("admin_response") || "") || null,
      });
      setOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="font-script text-2xl text-[var(--gold-dark)]">Bless</p>
      </div>
    );
  }

  return (
    <AdminShell user={user}>
      <PageHeader
        title="Reviews"
        subtitle="Approve, reject, or respond to product reviews."
      />

      <div className="mb-6 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="rounded-full px-4 py-1.5 text-[10px] font-semibold uppercase tracking-luxe transition-colors"
            style={
              filter === f
                ? { background: "var(--ink)", color: "white" }
                : { background: "white", color: "var(--ink-muted)", border: "1px solid var(--line)" }
            }
          >
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {reviews.map((r) => (
          <article
            key={r.id}
            className="bg-white p-6 transition-shadow hover:shadow-sm"
            style={{ border: "1px solid var(--line)", borderRadius: 4 }}
          >
            <div className="flex items-start justify-between gap-6">
              <div className="flex-1 min-w-0">
                <div className="mb-2 flex items-center gap-3 flex-wrap">
                  <Stars value={r.rating} />
                  <span className="font-display text-lg font-medium tracking-soft">{r.title}</span>
                  <StatusBadge status={r.status} />
                  {r.is_verified_purchase && (
                    <span className="badge badge-success">Verified</span>
                  )}
                </div>
                <p className="text-sm leading-relaxed text-[var(--ink-light)]">{r.content}</p>
                <p className="mt-3 text-[10px] uppercase tracking-luxe text-[var(--ink-muted)]">
                  by {r.customer_name || r.customer_email || "anonymous"} · on{" "}
                  <span className="text-[var(--gold-dark)]">{r.product_title || r.product_id}</span>
                </p>
                {r.admin_response && (
                  <div
                    className="mt-4 px-4 py-3 text-sm"
                    style={{
                      borderLeft: "2px solid var(--gold)",
                      background: "var(--cream)",
                    }}
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-luxe text-[var(--gold-dark)]">
                      Admin response
                    </p>
                    <p className="mt-1 text-[var(--ink-light)]">{r.admin_response}</p>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                {r.status !== "approved" && (
                  <button onClick={() => onUpdateStatus(r, "approved")} className={btnPrimary}>
                    <Check className="mr-1.5 h-3.5 w-3.5" /> Approve
                  </button>
                )}
                {r.status !== "rejected" && (
                  <button onClick={() => onUpdateStatus(r, "rejected")} className={btnGhost}>
                    <X className="mr-1.5 h-3.5 w-3.5" /> Reject
                  </button>
                )}
                <button onClick={() => { setEditing(r); setOpen(true); }} className={`${btnGhost} btn-sm`}>
                  {r.admin_response ? "Edit reply" : "Add reply"}
                </button>
                <button onClick={() => onDelete(r)} className={btnDanger}>Delete</button>
              </div>
            </div>
          </article>
        ))}
        {reviews.length === 0 && (
          <div
            className="bg-white p-16 text-center"
            style={{ border: "1px solid var(--line)", borderRadius: 4 }}
          >
            <p className="font-display text-2xl text-[var(--ink-muted)]">No reviews to show</p>
          </div>
        )}
        {count > 0 && (
          <div
            className="bg-white"
            style={{ border: "1px solid var(--line)", borderRadius: 4 }}
          >
            <Pagination
              page={page}
              pageSize={pageSize}
              total={count}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
              itemNoun="reviews"
            />
          </div>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Admin response"
        footer={
          <>
            <button onClick={() => setOpen(false)} className={btnGhost} type="button">Cancel</button>
            <button form="review-resp" type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        {editing && (
          <form id="review-resp" onSubmit={onSubmit} className="space-y-4">
            <Field label={`Replying to: ${editing.title}`}>
              <textarea
                name="admin_response"
                rows={5}
                defaultValue={editing.admin_response || ""}
                className="textarea"
              />
            </Field>
          </form>
        )}
      </Modal>
    </AdminShell>
  );
}

function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className="h-3.5 w-3.5"
          fill={n <= value ? "var(--gold)" : "transparent"}
          color="var(--gold)"
        />
      ))}
    </span>
  );
}

function StatusBadge({ status }: { status: Review["status"] }) {
  const cls =
    status === "approved" ? "badge badge-success" :
    status === "rejected" ? "badge badge-danger" : "badge badge-warn";
  return <span className={cls}>{status}</span>;
}
