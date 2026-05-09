"use client";

import { useEffect, useState, FormEvent } from "react";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthGate } from "@/lib/useAuthGate";
import type { Region } from "@/lib/types";
import { AdminShell } from "@/components/AdminShell";
import {
  Modal,
  Field,
  PageHeader,
  inputCls,
  btnPrimary,
  btnGhost,
} from "@/components/Modal";

export default function RegionsPage() {
  const { user, loading } = useAuthGate();
  const [regions, setRegions] = useState<Region[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await api.get<{ regions: Region[] }>("/admin/regions");
    setRegions(res.regions);
  };

  useEffect(() => { if (user) void load(); }, [user]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api.post("/admin/regions", {
        name: String(fd.get("name") || ""),
        currency_code: String(fd.get("currency_code") || "usd").toLowerCase(),
        countries: String(fd.get("countries") || "").split(",").map((s) => s.trim()).filter(Boolean),
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
        title="Regions"
        subtitle="Currencies and country mappings used for storefront pricing."
        actions={
          <button onClick={() => setOpen(true)} className={btnPrimary}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New region
          </button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {regions.map((r) => (
          <div
            key={r.id}
            className="bg-white p-6 transition-shadow hover:shadow-sm"
            style={{ border: "1px solid var(--line)", borderRadius: 4 }}
          >
            <div className="flex items-center justify-between">
              <p className="font-display text-xl font-medium tracking-soft">{r.name}</p>
              <span className="badge badge-gold">{r.currency_code}</span>
            </div>
            <p className="mt-3 text-xs uppercase tracking-luxe text-[var(--ink-muted)]">
              {(r.countries || []).join(" · ") || "No countries"}
            </p>
          </div>
        ))}
        {regions.length === 0 && (
          <div
            className="bg-white p-16 text-center md:col-span-2 lg:col-span-3"
            style={{ border: "1px solid var(--line)", borderRadius: 4 }}
          >
            <p className="font-display text-2xl text-[var(--ink-muted)]">No regions yet</p>
          </div>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New region"
        footer={
          <>
            <button onClick={() => setOpen(false)} className={btnGhost} type="button">Cancel</button>
            <button form="region-form" type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "Saving…" : "Create"}
            </button>
          </>
        }
      >
        <form id="region-form" onSubmit={onSubmit} className="space-y-5">
          <Field label="Name" required>
            <input name="name" required className={inputCls} placeholder="United States" />
          </Field>
          <Field label="Currency code" required>
            <input name="currency_code" defaultValue="usd" className={inputCls} placeholder="usd" />
          </Field>
          <Field label="Countries" hint="Comma-separated ISO 3166-1 alpha-2 codes">
            <input name="countries" placeholder="us, ca" className={inputCls} />
          </Field>
        </form>
      </Modal>
    </AdminShell>
  );
}
