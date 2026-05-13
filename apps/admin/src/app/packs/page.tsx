"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import { Package, Megaphone, Ticket, ImageIcon, Plus, Trash2, Rocket } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthGate } from "@/lib/useAuthGate";
import { useDialog } from "@/components/Dialog";
import type {
  PackDefinition,
  PackCampaign,
  PackSlot,
  PackStats,
  Product,
} from "@/lib/types";
import { AdminShell } from "@/components/AdminShell";
import {
  Modal,
  Field,
  PageHeader,
  inputCls,
  btnPrimary,
  btnGhost,
  SectionTitle,
} from "@/components/Modal";
import { Pagination } from "@/components/Pagination";

type Tab = "definitions" | "campaigns" | "slots";

const fmtDate = (s: string | null) =>
  s
    ? new Date(s).toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const CAMPAIGN_STATUSES = [
  "open",
  "filling",
  "ready_to_process",
  "processing",
  "fulfilled",
  "cancelled",
] as const;

const SLOT_STATUSES = [
  "available",
  "reserved",
  "paid",
  "fulfilled",
  "cancelled",
  "released",
] as const;

const DEF_STATUSES = ["draft", "published"] as const;

const CAMPAIGN_BADGE: Record<string, string> = {
  open: "badge badge-info",
  filling: "badge badge-warn",
  ready_to_process: "badge badge-gold",
  processing: "badge badge-gold",
  fulfilled: "badge badge-success",
  cancelled: "badge badge-mute",
};

const SLOT_BADGE: Record<string, string> = {
  available: "badge badge-info",
  reserved: "badge badge-warn",
  paid: "badge badge-success",
  fulfilled: "badge badge-gold",
  cancelled: "badge badge-mute",
  released: "badge badge-mute",
};

export default function PacksPage() {
  const { user, loading } = useAuthGate();
  const dialog = useDialog();
  const [tab, setTab] = useState<Tab>("definitions");
  const [stats, setStats] = useState<PackStats | null>(null);

  // ─── Common pagination/filter state, scoped per tab ─────────────────────
  const [defs, setDefs] = useState<PackDefinition[]>([]);
  const [defsCount, setDefsCount] = useState(0);
  const [defsPage, setDefsPage] = useState(1);
  const [defsPageSize, setDefsPageSize] = useState(25);
  const [defsStatus, setDefsStatus] = useState<string>("");
  const [defsSearch, setDefsSearch] = useState("");
  const [defsSearchInput, setDefsSearchInput] = useState("");

  // Create-definition modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [createKind, setCreateKind] = useState<"single" | "merge">("single");
  const [createSelectedProducts, setCreateSelectedProducts] = useState<string[]>([]);
  const [createProductSearch, setCreateProductSearch] = useState("");

  const [camps, setCamps] = useState<PackCampaign[]>([]);
  const [campsCount, setCampsCount] = useState(0);
  const [campsPage, setCampsPage] = useState(1);
  const [campsPageSize, setCampsPageSize] = useState(25);
  const [campsStatus, setCampsStatus] = useState<string>("");

  const [slots, setSlots] = useState<PackSlot[]>([]);
  const [slotsCount, setSlotsCount] = useState(0);
  const [slotsPage, setSlotsPage] = useState(1);
  const [slotsPageSize, setSlotsPageSize] = useState(25);
  const [slotsStatus, setSlotsStatus] = useState<string>("");
  const [slotsCampaign, setSlotsCampaign] = useState<string>("");

  // ─── Loaders ────────────────────────────────────────────────────────────
  const loadStats = async () => {
    const s = await api.get<PackStats>("/admin/packs/stats");
    setStats(s);
  };

  const defsQs = useMemo(() => {
    const p = new URLSearchParams({
      limit: String(defsPageSize),
      offset: String((defsPage - 1) * defsPageSize),
    });
    if (defsStatus) p.set("status", defsStatus);
    if (defsSearch) p.set("q", defsSearch);
    return p.toString();
  }, [defsPage, defsPageSize, defsStatus, defsSearch]);

  const campsQs = useMemo(() => {
    const p = new URLSearchParams({
      limit: String(campsPageSize),
      offset: String((campsPage - 1) * campsPageSize),
    });
    if (campsStatus) p.set("status", campsStatus);
    return p.toString();
  }, [campsPage, campsPageSize, campsStatus]);

  const slotsQs = useMemo(() => {
    const p = new URLSearchParams({
      limit: String(slotsPageSize),
      offset: String((slotsPage - 1) * slotsPageSize),
    });
    if (slotsStatus) p.set("status", slotsStatus);
    if (slotsCampaign) p.set("campaign_id", slotsCampaign);
    return p.toString();
  }, [slotsPage, slotsPageSize, slotsStatus, slotsCampaign]);

  useEffect(() => { if (user) void loadStats(); }, [user]);

  useEffect(() => {
    if (!user || tab !== "definitions") return;
    (async () => {
      const r = await api.get<{ definitions: PackDefinition[]; count: number }>(
        `/admin/packs/definitions?${defsQs}`
      );
      setDefs(r.definitions);
      setDefsCount(r.count);
    })();
  }, [user, tab, defsQs]);

  useEffect(() => { setDefsPage(1); }, [defsStatus, defsSearch]);

  useEffect(() => {
    if (!user || tab !== "campaigns") return;
    (async () => {
      const r = await api.get<{ campaigns: PackCampaign[]; count: number }>(
        `/admin/packs/campaigns?${campsQs}`
      );
      setCamps(r.campaigns);
      setCampsCount(r.count);
    })();
  }, [user, tab, campsQs]);

  useEffect(() => { setCampsPage(1); }, [campsStatus]);

  useEffect(() => {
    if (!user || tab !== "slots") return;
    (async () => {
      const r = await api.get<{ slots: PackSlot[]; count: number }>(
        `/admin/packs/slots?${slotsQs}`
      );
      setSlots(r.slots);
      setSlotsCount(r.count);
    })();
  }, [user, tab, slotsQs]);

  useEffect(() => { setSlotsPage(1); }, [slotsStatus, slotsCampaign]);

  // ─── Mutations ──────────────────────────────────────────────────────────
  const onToggleDefinitionStatus = async (d: PackDefinition) => {
    const next = d.status === "published" ? "draft" : "published";
    const ok = await dialog.confirm({
      title: `${next === "published" ? "Publish" : "Unpublish"} "${d.title}"?`,
      message:
        next === "published"
          ? "Once published, affiliates can launch campaigns from this pack."
          : "Existing campaigns keep running, but no new ones can be launched.",
      tone: "warning",
      confirmLabel: next === "published" ? "Publish" : "Unpublish",
    });
    if (!ok) return;
    await api.patch(`/admin/packs/definitions/${d.id}`, { status: next });
    setDefs((prev) => prev.map((x) => (x.id === d.id ? { ...x, status: next } : x)));
  };

  // ─── Create / launch / delete pack definitions ──────────────────────────
  const openCreate = async () => {
    setCreateOpen(true);
    if (products.length === 0) {
      try {
        const res = await api.get<{ products: Product[] }>(
          "/admin/products?limit=200"
        );
        setProducts(res.products);
      } catch {
        // non-fatal — admin can still type details
      }
    }
  };

  const onCreateDefinition = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setCreateBusy(true);
    const fd = new FormData(e.currentTarget);
    const kind = (String(fd.get("pack_kind") || "single") === "merge"
      ? "merge"
      : "single") as "single" | "merge";
    const productIds = createSelectedProducts;
    if (productIds.length === 0) {
      setCreateBusy(false);
      await dialog.alert({
        title: "Pick at least one product",
        message: "A pack needs at least one product. Merge packs allow multiple.",
        tone: "warning",
      });
      return;
    }
    const body = {
      pack_kind: kind,
      product_ids: productIds,
      title: String(fd.get("title") || "").trim(),
      handle: String(fd.get("handle") || "").trim() || undefined,
      description: String(fd.get("description") || "").trim() || undefined,
      status: String(fd.get("status") || "draft") as "draft" | "published",
    };
    try {
      await api.post("/admin/packs/definitions", body);
      setCreateOpen(false);
      setCreateSelectedProducts([]);
      setCreateKind("single");
      // Force a refetch via state bump
      setDefsPage((p) => p);
      setDefsSearch((s) => s);
      const r = await api.get<{ definitions: PackDefinition[]; count: number }>(
        `/admin/packs/definitions?limit=${defsPageSize}&offset=${(defsPage - 1) * defsPageSize}${defsStatus ? `&status=${defsStatus}` : ""}${defsSearch ? `&q=${encodeURIComponent(defsSearch)}` : ""}`
      );
      setDefs(r.definitions);
      setDefsCount(r.count);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      await dialog.alert({ title: "Create failed", message, tone: "danger" });
    } finally {
      setCreateBusy(false);
    }
  };

  const onLaunchCampaign = async (d: PackDefinition) => {
    if (d.status !== "published") {
      const ok = await dialog.confirm({
        title: "Publish this pack first?",
        message: "Only published packs can be launched into a campaign.",
        tone: "warning",
        confirmLabel: "Publish + launch",
      });
      if (!ok) return;
      await api.patch(`/admin/packs/definitions/${d.id}`, { status: "published" });
    }
    try {
      const res = await api.post<{ campaign: PackCampaign; public_code: string }>(
        `/admin/packs/definitions/${d.id}/launch`,
        {}
      );
      await dialog.alert({
        title: "Campaign live",
        message: `Public code: ${res.public_code}. Customers can now claim slots.`,
        tone: "success",
      });
      setTab("campaigns");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Launch failed";
      await dialog.alert({ title: "Launch failed", message, tone: "danger" });
    }
  };

  const onDeleteDefinition = async (d: PackDefinition) => {
    const ok = await dialog.confirm({
      title: `Delete pack "${d.title}"?`,
      message:
        "The definition is soft-deleted and any open campaigns are cancelled. Already-fulfilled orders are untouched.",
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/packs/definitions/${d.id}`);
      setDefs((prev) => prev.filter((x) => x.id !== d.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      await dialog.alert({ title: "Delete failed", message, tone: "danger" });
    }
  };

  const onChangeCampaignStatus = async (c: PackCampaign, status: string) => {
    if (status === c.status) return;
    const ok = await dialog.confirm({
      title: `Move campaign ${c.public_code} → ${status}?`,
      message: status === "cancelled"
        ? "Cancelling closes all open slots. Paid customers must be refunded out-of-band."
        : `Campaign status will be updated to “${status}”.`,
      tone: status === "cancelled" ? "danger" : "warning",
      confirmLabel: "Update status",
    });
    if (!ok) return;
    await api.patch(`/admin/packs/campaigns/${c.id}`, { status });
    setCamps((prev) =>
      prev.map((x) => (x.id === c.id ? { ...x, status: status as PackCampaign["status"] } : x))
    );
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
        title="Packs"
        subtitle="Wholesale pack definitions, affiliate campaigns, and the slots customers join."
      />

      {/* Stat strip */}
      <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Definitions" value={stats?.definitions ?? 0} />
        <Stat
          label="Open campaigns"
          value={(stats?.campaigns_by_status?.open ?? 0) +
                 (stats?.campaigns_by_status?.filling ?? 0)}
          accent="info"
        />
        <Stat
          label="Paid slots"
          value={stats?.slots_by_status?.paid ?? 0}
          accent="success"
        />
        <Stat
          label="Reserved slots"
          value={stats?.slots_by_status?.reserved ?? 0}
          accent="warn"
        />
      </div>

      {/* Tabs */}
      <div
        className="mb-5 flex items-center gap-1 overflow-x-auto"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        <TabBtn active={tab === "definitions"} onClick={() => setTab("definitions")} icon={<Package className="h-3.5 w-3.5" />} label="Definitions" />
        <TabBtn active={tab === "campaigns"} onClick={() => setTab("campaigns")} icon={<Megaphone className="h-3.5 w-3.5" />} label="Campaigns" />
        <TabBtn active={tab === "slots"} onClick={() => setTab("slots")} icon={<Ticket className="h-3.5 w-3.5" />} label="Slots" />
      </div>

      {/* ─── Definitions ─── */}
      {tab === "definitions" && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <form
              className="relative flex-1 max-w-md"
              onSubmit={(e) => { e.preventDefault(); setDefsSearch(defsSearchInput.trim()); }}
            >
              <input
                value={defsSearchInput}
                onChange={(e) => setDefsSearchInput(e.target.value)}
                placeholder="Search title or handle…"
                className={inputCls}
              />
            </form>
            <select
              value={defsStatus}
              onChange={(e) => setDefsStatus(e.target.value)}
              className="select max-w-[160px]"
            >
              <option value="">All statuses</option>
              {DEF_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={openCreate} className={btnPrimary}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New pack
            </button>
          </div>

          <div className="overflow-hidden bg-white" style={{ border: "1px solid var(--line)", borderRadius: 4 }}>
            <table className="w-full text-sm">
              <thead style={{ background: "var(--cream)" }}>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
                  <th className="px-4 py-3 w-14"></th>
                  <th className="px-4 py-3">Pack</th>
                  <th className="px-3 py-3">Linked product</th>
                  <th className="px-3 py-3">Campaigns</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {defs.map((d) => (
                  <tr key={d.id} style={{ borderTop: "1px solid var(--line-soft)" }} className="hover:bg-[var(--cream)] transition-colors">
                    <td className="px-4 py-3">
                      {d.product_thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={d.product_thumbnail} alt="" className="h-10 w-10 rounded-sm object-cover" style={{ border: "1px solid var(--line-soft)" }} />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded-sm" style={{ background: "var(--cream-dark)", color: "var(--ink-muted)" }}>
                          <ImageIcon className="h-3.5 w-3.5" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-display text-base font-medium tracking-soft">{d.title}</p>
                      <p className="font-mono text-xs text-[var(--ink-muted)]">{d.handle}</p>
                    </td>
                    <td className="px-3 py-3 text-sm">{d.product_title || <span className="text-[var(--ink-muted)]">— missing —</span>}</td>
                    <td className="px-3 py-3 font-display text-base">{d.campaign_count}</td>
                    <td className="px-3 py-3">
                      <span className={d.status === "published" ? "badge badge-success" : "badge badge-mute"}>
                        {d.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onLaunchCampaign(d)}
                          title="Launch a public campaign"
                          aria-label="Launch campaign"
                          className="flex h-8 w-8 items-center justify-center rounded-sm text-[var(--ink-muted)] transition-colors hover:bg-[var(--cream-dark)] hover:text-[var(--gold-dark)]"
                        >
                          <Rocket className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => onToggleDefinitionStatus(d)} className={`${btnGhost} btn-sm`}>
                          {d.status === "published" ? "Unpublish" : "Publish"}
                        </button>
                        <button
                          onClick={() => onDeleteDefinition(d)}
                          title="Delete"
                          aria-label="Delete"
                          className="flex h-8 w-8 items-center justify-center rounded-sm text-[var(--ink-muted)] transition-colors hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {defs.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-16 text-center"><p className="font-display text-2xl text-[var(--ink-muted)]">No pack definitions</p></td></tr>
                )}
              </tbody>
            </table>
            {defsCount > 0 && (
              <Pagination
                page={defsPage}
                pageSize={defsPageSize}
                total={defsCount}
                onPageChange={setDefsPage}
                onPageSizeChange={(s) => { setDefsPageSize(s); setDefsPage(1); }}
                itemNoun="definitions"
              />
            )}
          </div>
        </div>
      )}

      {/* ─── Campaigns ─── */}
      {tab === "campaigns" && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <SectionTitle hint="Each campaign is an affiliate-launched copy of a pack definition.">Filter</SectionTitle>
            <select value={campsStatus} onChange={(e) => setCampsStatus(e.target.value)} className="select max-w-[200px]">
              <option value="">All statuses</option>
              {CAMPAIGN_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
            </select>
          </div>

          <div className="overflow-hidden bg-white" style={{ border: "1px solid var(--line)", borderRadius: 4 }}>
            <table className="w-full text-sm">
              <thead style={{ background: "var(--cream)" }}>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
                  <th className="px-4 py-3">Code</th>
                  <th className="px-3 py-3">Pack / Product</th>
                  <th className="px-3 py-3">Affiliate</th>
                  <th className="px-3 py-3">Slots</th>
                  <th className="px-3 py-3">Created</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {camps.map((c) => (
                  <tr key={c.id} style={{ borderTop: "1px solid var(--line-soft)" }} className="hover:bg-[var(--cream)] transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-[var(--gold-dark)]">{c.public_code}</td>
                    <td className="px-3 py-3">
                      <p className="font-medium">{c.definition_title}</p>
                      <p className="text-xs text-[var(--ink-muted)]">{c.product_title || c.definition_handle}</p>
                    </td>
                    <td className="px-3 py-3 text-sm">
                      {c.affiliate_code ? (
                        <>
                          <p className="font-mono text-xs text-[var(--gold-dark)]">{c.affiliate_code}</p>
                          <p className="text-xs text-[var(--ink-muted)]">{c.affiliate_email}</p>
                        </>
                      ) : (
                        <span className="text-[var(--ink-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-display text-base">{c.paid_slots}</span>
                      <span className="text-xs text-[var(--ink-muted)]"> / {c.total_slots}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--ink-muted)]">{fmtDate(c.created_at)}</td>
                    <td className="px-3 py-3">
                      <span className={CAMPAIGN_BADGE[c.status] || "badge badge-mute"}>{c.status.replace(/_/g, " ")}</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <select
                        value={c.status}
                        onChange={(e) => onChangeCampaignStatus(c, e.target.value)}
                        className="select py-1.5 text-xs max-w-[150px]"
                      >
                        {CAMPAIGN_STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
                {camps.length === 0 && (
                  <tr><td colSpan={7} className="px-5 py-16 text-center"><p className="font-display text-2xl text-[var(--ink-muted)]">No campaigns</p></td></tr>
                )}
              </tbody>
            </table>
            {campsCount > 0 && (
              <Pagination
                page={campsPage}
                pageSize={campsPageSize}
                total={campsCount}
                onPageChange={setCampsPage}
                onPageSizeChange={(s) => { setCampsPageSize(s); setCampsPage(1); }}
                itemNoun="campaigns"
              />
            )}
          </div>
        </div>
      )}

      {/* ─── Slots ─── */}
      {tab === "slots" && (
        <div>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select value={slotsStatus} onChange={(e) => setSlotsStatus(e.target.value)} className="select max-w-[180px]">
              <option value="">All statuses</option>
              {SLOT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <input
              value={slotsCampaign}
              onChange={(e) => setSlotsCampaign(e.target.value)}
              placeholder="Campaign id (optional)"
              className={`${inputCls} max-w-[280px]`}
            />
          </div>

          <div className="overflow-hidden bg-white" style={{ border: "1px solid var(--line)", borderRadius: 4 }}>
            <table className="w-full text-sm">
              <thead style={{ background: "var(--cream)" }}>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
                  <th className="px-4 py-3">Campaign</th>
                  <th className="px-3 py-3">Variant / Size</th>
                  <th className="px-3 py-3">SKU</th>
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Joined</th>
                </tr>
              </thead>
              <tbody>
                {slots.map((s) => (
                  <tr key={s.id} style={{ borderTop: "1px solid var(--line-soft)" }} className="hover:bg-[var(--cream)] transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{s.campaign_code || s.pack_campaign_id.slice(0, 12)}</td>
                    <td className="px-3 py-3">
                      <p className="font-medium">{s.variant_title || s.size_label}</p>
                      <p className="text-xs text-[var(--ink-muted)]">Size {s.size_label}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-[var(--ink-muted)]">{s.sku || "—"}</td>
                    <td className="px-3 py-3 text-sm">
                      {s.customer_email ? (
                        <>
                          <p className="font-medium">{s.customer_name || s.customer_email}</p>
                          {s.customer_name && (
                            <p className="text-xs text-[var(--ink-muted)]">{s.customer_email}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-[var(--ink-muted)]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className={SLOT_BADGE[s.status] || "badge badge-mute"}>{s.status}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-[var(--ink-muted)]">{fmtDate(s.created_at)}</td>
                  </tr>
                ))}
                {slots.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-16 text-center"><p className="font-display text-2xl text-[var(--ink-muted)]">No slots</p></td></tr>
                )}
              </tbody>
            </table>
            {slotsCount > 0 && (
              <Pagination
                page={slotsPage}
                pageSize={slotsPageSize}
                total={slotsCount}
                onPageChange={setSlotsPage}
                onPageSizeChange={(s) => { setSlotsPageSize(s); setSlotsPage(1); }}
                itemNoun="slots"
              />
            )}
          </div>
        </div>
      )}

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New pack"
        footer={
          <>
            <button onClick={() => setCreateOpen(false)} className={btnGhost}>Cancel</button>
            <button form="pack-create-form" type="submit" disabled={createBusy} className={btnPrimary}>
              {createBusy ? "Creating…" : "Create pack"}
            </button>
          </>
        }
      >
        <form id="pack-create-form" onSubmit={onCreateDefinition} className="space-y-4">
          <Field label="Pack kind" required>
            <div className="grid grid-cols-2 gap-2">
              <label
                className={`cursor-pointer rounded-sm border px-4 py-3 transition-colors ${
                  createKind === "single"
                    ? "border-[var(--gold)] bg-[var(--cream)]"
                    : "border-[var(--line)] hover:bg-[var(--cream-dark)]"
                }`}
              >
                <input
                  type="radio"
                  name="pack_kind"
                  value="single"
                  className="hidden"
                  checked={createKind === "single"}
                  onChange={() => {
                    setCreateKind("single");
                    setCreateSelectedProducts((cur) => cur.slice(0, 1));
                  }}
                />
                <p className="font-semibold text-sm">Single pack</p>
                <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                  One product, every variant becomes a slot (e.g. all sizes of one shirt).
                </p>
              </label>
              <label
                className={`cursor-pointer rounded-sm border px-4 py-3 transition-colors ${
                  createKind === "merge"
                    ? "border-[var(--gold)] bg-[var(--cream)]"
                    : "border-[var(--line)] hover:bg-[var(--cream-dark)]"
                }`}
              >
                <input
                  type="radio"
                  name="pack_kind"
                  value="merge"
                  className="hidden"
                  checked={createKind === "merge"}
                  onChange={() => setCreateKind("merge")}
                />
                <p className="font-semibold text-sm">Merge pack</p>
                <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                  Many products together (e.g. a shirt + trousers + shoes outfit).
                </p>
              </label>
            </div>
          </Field>

          <Field
            label={createKind === "merge" ? "Products" : "Product"}
            required
            hint={
              createKind === "merge"
                ? "Add as many products as you want. Each variant becomes a slot customers can claim."
                : "Only products with at least one variant can become packs."
            }
          >
            <input
              type="search"
              value={createProductSearch}
              onChange={(e) => setCreateProductSearch(e.target.value)}
              placeholder="Search products…"
              className={`${inputCls} mb-2`}
            />
            <div
              className="max-h-56 overflow-y-auto rounded-sm bg-white"
              style={{ border: "1px solid var(--line)" }}
            >
              {products
                .filter((p) => {
                  const q = createProductSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    p.title.toLowerCase().includes(q) ||
                    p.handle.toLowerCase().includes(q)
                  );
                })
                .map((p) => {
                  const checked = createSelectedProducts.includes(p.id);
                  return (
                    <label
                      key={p.id}
                      className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-[var(--cream-dark)]"
                      style={{ borderBottom: "1px solid var(--line-soft)" }}
                    >
                      <input
                        type={createKind === "merge" ? "checkbox" : "radio"}
                        name="product_pick"
                        checked={checked}
                        onChange={() => {
                          if (createKind === "single") {
                            setCreateSelectedProducts([p.id]);
                          } else {
                            setCreateSelectedProducts((cur) =>
                              cur.includes(p.id)
                                ? cur.filter((x) => x !== p.id)
                                : [...cur, p.id]
                            );
                          }
                        }}
                        className="h-4 w-4 accent-[var(--gold-dark)]"
                      />
                      <span className="text-sm flex-1 truncate">{p.title}</span>
                      <span className="font-mono text-[10px] text-[var(--ink-muted)]">
                        {p.handle}
                      </span>
                    </label>
                  );
                })}
              {products.length === 0 && (
                <p className="px-3 py-3 text-xs italic text-[var(--ink-muted)]">
                  No products loaded.
                </p>
              )}
            </div>
            <p className="mt-1.5 text-[10px] uppercase tracking-luxe text-[var(--gold-dark)]">
              {createSelectedProducts.length} selected
            </p>
          </Field>

          <Field label="Pack title" required>
            <input
              name="title"
              required
              className={inputCls}
              placeholder="Summer Linen Drop"
            />
          </Field>
          <Field label="Handle" hint="URL-safe slug. Leave blank to auto-generate.">
            <input
              name="handle"
              className={inputCls}
              placeholder="summer-linen-drop"
            />
          </Field>
          <Field label="Description">
            <textarea
              name="description"
              rows={3}
              className={inputCls}
              placeholder="Short copy customers see on the campaign page."
            />
          </Field>
          <Field label="Status" hint="Draft hides the pack from customers; Publish makes it joinable.">
            <select name="status" className="select" defaultValue="draft">
              <option value="draft">Draft</option>
              <option value="published">Publish immediately</option>
            </select>
          </Field>
        </form>
      </Modal>
    </AdminShell>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: "info" | "warn" | "success" | "danger";
}) {
  const accentBg: Record<string, string> = {
    info: "color-mix(in srgb, #2563EB 12%, white)",
    warn: "color-mix(in srgb, var(--gold) 18%, white)",
    success: "color-mix(in srgb, #16A34A 12%, white)",
    danger: "color-mix(in srgb, #DC2626 12%, white)",
  };
  return (
    <div className="bg-white p-4" style={{ border: "1px solid var(--line)", borderRadius: 4 }}>
      <p className="text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">{label}</p>
      <p
        className="mt-2 font-display text-3xl"
        style={{
          color: accent ? "var(--ink)" : "var(--ink)",
          background: accent ? accentBg[accent] : undefined,
          padding: accent ? "0 0.4rem" : 0,
          display: accent ? "inline-block" : undefined,
          borderRadius: 2,
        }}
      >
        {value}
      </p>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className="relative flex items-center gap-1.5 whitespace-nowrap px-4 py-2.5 text-[11px] font-semibold uppercase tracking-luxe transition-colors"
      style={{ color: active ? "var(--ink)" : "var(--ink-muted)" }}
    >
      <span style={{ color: active ? "var(--gold-dark)" : "var(--ink-muted)" }}>{icon}</span>
      {label}
      {active && (
        <span
          className="absolute bottom-[-1px] left-0 right-0 h-[2px]"
          style={{ background: "var(--gold)" }}
        />
      )}
    </button>
  );
}
