"use client";

import { useEffect, useMemo, useState } from "react";
import { Globe, Check, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthGate } from "@/lib/useAuthGate";
import { AdminShell } from "@/components/AdminShell";
import { useDialog } from "@/components/Dialog";
import {
  PageHeader,
  inputCls,
  btnPrimary,
  btnGhost,
  SectionTitle,
} from "@/components/Modal";

interface Country {
  code: string;
  name: string;
  is_allowed: boolean;
}

type Filter = "all" | "allowed" | "blocked";

export default function CountriesPage() {
  const { user, loading } = useAuthGate();
  const dialog = useDialog();
  const [rows, setRows] = useState<Country[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await api.get<{
      countries: Country[];
      allowed_count: number;
      total: number;
    }>("/admin/countries");
    setRows(res.countries);
    setDirty({});
  };

  useEffect(() => {
    if (user) void load();
  }, [user]);

  const allowedCount = useMemo(
    () =>
      Object.entries(dirty).length > 0
        ? rows.filter((r) => effective(r, dirty)).length
        : rows.filter((r) => r.is_allowed).length,
    [rows, dirty]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const eff = effective(r, dirty);
      if (filter === "allowed" && !eff) return false;
      if (filter === "blocked" && eff) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q)
      );
    });
  }, [rows, filter, search, dirty]);

  const toggle = (code: string) => {
    setDirty((prev) => {
      const next = { ...prev };
      const current = effective(rows.find((r) => r.code === code) || rows[0], next);
      next[code] = !current;
      return next;
    });
  };

  const selectAllVisible = (allowed: boolean) => {
    setDirty((prev) => {
      const next = { ...prev };
      for (const r of filtered) {
        next[r.code] = allowed;
      }
      return next;
    });
  };

  const save = async () => {
    if (Object.keys(dirty).length === 0) return;
    setSaving(true);
    try {
      const allowedCodes = rows
        .filter((r) => effective(r, dirty))
        .map((r) => r.code);
      await api.put("/admin/countries", { allowed: allowedCodes });
      await load();
      await dialog.alert({
        title: "Saved",
        message: `${allowedCodes.length} countr${allowedCodes.length === 1 ? "y" : "ies"} now allowed.`,
        tone: "success",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      await dialog.alert({ title: "Save failed", message, tone: "danger" });
    } finally {
      setSaving(false);
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
        title="Countries"
        subtitle="Pick which countries can access the storefront. Visitors from blocked countries see a holding page."
      />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[260px]">
          <Globe className="h-4 w-4 text-[var(--ink-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputCls} flex-1`}
            placeholder="Search by name or code…"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "allowed", "blocked"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="rounded-full px-4 py-1.5 text-[10px] font-semibold uppercase tracking-luxe transition-colors"
              style={
                filter === f
                  ? { background: "var(--ink)", color: "white" }
                  : {
                      background: "white",
                      color: "var(--ink-muted)",
                      border: "1px solid var(--line)",
                    }
              }
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SectionTitle hint="Changes only take effect after Save.">
          {allowedCount} of {rows.length} allowed
        </SectionTitle>
        <div className="flex items-center gap-2">
          <button onClick={() => selectAllVisible(true)} className={btnGhost}>
            <Check className="mr-1.5 h-3.5 w-3.5" />
            Allow visible
          </button>
          <button onClick={() => selectAllVisible(false)} className={btnGhost}>
            <X className="mr-1.5 h-3.5 w-3.5" />
            Block visible
          </button>
          <button
            onClick={save}
            disabled={saving || Object.keys(dirty).length === 0}
            className={btnPrimary}
          >
            {saving ? "Saving…" : `Save (${Object.keys(dirty).length})`}
          </button>
        </div>
      </div>

      <div
        className="bg-white"
        style={{ border: "1px solid var(--line)", borderRadius: 4 }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c) => {
            const allowed = effective(c, dirty);
            const changed = dirty[c.code] !== undefined;
            return (
              <button
                key={c.code}
                onClick={() => toggle(c.code)}
                className="flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--cream)]"
                style={{ borderBottom: "1px solid var(--line-soft)" }}
              >
                <span
                  className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-sm"
                  style={{
                    background: allowed ? "var(--gold-dark)" : "white",
                    border: allowed ? "none" : "1px solid var(--line)",
                  }}
                >
                  {allowed && <Check className="h-3.5 w-3.5 text-white" />}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {c.name}
                  </span>
                  <span className="block text-[10px] font-mono uppercase tracking-luxe text-[var(--ink-muted)]">
                    {c.code} {changed && "· edited"}
                  </span>
                </span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full py-16 text-center text-sm italic text-[var(--ink-muted)]">
              No countries match this filter.
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}

function effective(c: Country | undefined, dirty: Record<string, boolean>): boolean {
  if (!c) return false;
  return dirty[c.code] !== undefined ? dirty[c.code] : c.is_allowed;
}
