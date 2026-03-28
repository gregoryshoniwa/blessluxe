"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Tab =
  | "oversight"
  | "affiliates"
  | "sales"
  | "payouts"
  | "disputes"
  | "messages"
  | "blits"
  | "pack_loyalty"
  | "social";

type OversightSubTab = "storefront" | "blits" | "pack_campaigns" | "pack_slots";

interface Affiliate {
  id: string;
  code: string;
  first_name: string;
  last_name: string;
  email: string;
  commission_rate: number;
  status: "active" | "inactive" | "pending";
  total_earnings: string;
  paid_out: string;
  page_enabled?: boolean;
  available_commission?: string;
}

interface Sale {
  id: string;
  code: string;
  email: string;
  order_id: string;
  order_total: string;
  commission_amount: string;
  status: string;
  metadata?: Record<string, unknown> | null;
}

interface Payout {
  id: string;
  code: string;
  email: string;
  amount: string;
  method: string;
  status: string;
}

interface Dispute {
  id: string;
  affiliate_id: string;
  code?: string;
  affiliate_email?: string;
  customer_email?: string | null;
  order_ref?: string | null;
  subject: string;
  body: string;
  status: string;
  admin_notes?: string | null;
  created_at: string;
}

interface AdminMessage {
  id: string;
  affiliate_id: string;
  from_admin: boolean;
  body: string;
  created_at: string;
  code?: string;
}

interface GiftType {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  cost_blits: number;
  sort_order: number;
  active: boolean;
}

interface GiftEventRow {
  id: string;
  customer_id: string;
  affiliate_id: string;
  post_id: string | null;
  gift_type_id: string;
  blits_spent: string;
  created_at: string;
  affiliate_code: string;
  affiliate_email: string;
}

interface SocialModerationPost {
  id: string;
  caption: string;
  image_url: string;
  code: string;
  email: string;
  created_at: string;
}

interface StorefrontTxRow {
  id: string;
  customer_id: string;
  order_number: string;
  amount: string;
  currency_code: string;
  status: string;
  invoice_url: string | null;
  created_at: string;
  customer_email: string;
  line_items: Array<{
    id: string;
    product_title: string;
    quantity: number;
    unit_price: string;
    product_handle: string | null;
  }>;
}

interface BlitsLedgerRow {
  id: string;
  customer_id: string;
  delta_blits: string;
  balance_after: string;
  kind: string;
  metadata: unknown;
  created_at: string;
  customer_email: string | null;
}

interface PackCampaignOversightRow {
  id: string;
  public_code: string;
  status: string;
  pack_definition_id: string;
  pack_title: string;
  affiliate_id: string | null;
  affiliate_code: string | null;
  affiliate_email: string | null;
  gift_countdown_ends_at: string | null;
  gift_blits_prize: string | null;
  gift_allocation_type: string | null;
  created_at: string;
  updated_at: string;
  slot_count: string;
  paid_count: string;
  reserved_count: string;
}

interface PackSlotOversightRow {
  id: string;
  pack_campaign_id: string;
  variant_id: string;
  size_label: string;
  status: string;
  customer_id: string | null;
  order_id: string | null;
  line_item_id: string | null;
  collection_code: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
  campaign_public_code: string;
  campaign_status: string;
  pack_title: string;
  affiliate_code: string | null;
  storefront_email: string | null;
}

export default function AffiliateAdminClient() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("affiliates");
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [socialPosts, setSocialPosts] = useState<SocialModerationPost[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [blitsSettings, setBlitsSettings] = useState<Record<string, unknown> | null>(null);
  const [giftTypes, setGiftTypes] = useState<GiftType[]>([]);
  const [giftEvents, setGiftEvents] = useState<GiftEventRow[]>([]);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [messageAffiliateId, setMessageAffiliateId] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [disputeDraft, setDisputeDraft] = useState({ affiliate_id: "", subject: "", body: "" });
  const [error, setError] = useState("");
  const [savingBlits, setSavingBlits] = useState(false);
  const [packLoyaltySettings, setPackLoyaltySettings] = useState<Record<string, unknown> | null>(null);
  const [savingPackLoyalty, setSavingPackLoyalty] = useState(false);
  const [adminPackCampaignId, setAdminPackCampaignId] = useState("");
  const [adminPackClosing, setAdminPackClosing] = useState(false);
  const [adminPackGiftSaving, setAdminPackGiftSaving] = useState(false);

  const [oversightTx, setOversightTx] = useState<StorefrontTxRow[]>([]);
  const [oversightBlits, setOversightBlits] = useState<BlitsLedgerRow[]>([]);
  const [oversightPacks, setOversightPacks] = useState<PackCampaignOversightRow[]>([]);
  const [oversightSlots, setOversightSlots] = useState<PackSlotOversightRow[]>([]);
  const [oversightLoading, setOversightLoading] = useState(false);
  const [ovTxQ, setOvTxQ] = useState("");
  const [ovBlitsQ, setOvBlitsQ] = useState("");
  const [ovPackQ, setOvPackQ] = useState("");
  const [ovPackStatus, setOvPackStatus] = useState("");
  const [ovSlotQ, setOvSlotQ] = useState("");
  const [ovSlotCampaignId, setOvSlotCampaignId] = useState("");
  const [oversightSubTab, setOversightSubTab] = useState<OversightSubTab>("storefront");
  const oversightFiltersRef = useRef({
    ovTxQ,
    ovBlitsQ,
    ovPackQ,
    ovPackStatus,
    ovSlotQ,
    ovSlotCampaignId,
  });
  oversightFiltersRef.current = {
    ovTxQ,
    ovBlitsQ,
    ovPackQ,
    ovPackStatus,
    ovSlotQ,
    ovSlotCampaignId,
  };

  const loadOversight = useCallback(async () => {
    setOversightLoading(true);
    setError("");
    const f = oversightFiltersRef.current;
    const qs = (path: string, params: Record<string, string>) => {
      const u = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v) u.set(k, v);
      }
      const q = u.toString();
      return q ? `${path}?${q}` : path;
    };
    try {
      const [txRes, blitsRes, packRes, slotRes] = await Promise.all([
        fetch(qs("/api/admin/oversight/storefront-transactions", { q: f.ovTxQ, limit: "150" }), {
          cache: "no-store",
        }),
        fetch(qs("/api/admin/oversight/blits-ledger", { q: f.ovBlitsQ, limit: "200" }), { cache: "no-store" }),
        fetch(qs("/api/admin/oversight/pack-campaigns", { q: f.ovPackQ, status: f.ovPackStatus, limit: "150" }), {
          cache: "no-store",
        }),
        fetch(
          qs("/api/admin/oversight/pack-slots", { q: f.ovSlotQ, campaign_id: f.ovSlotCampaignId, limit: "200" }),
          { cache: "no-store" }
        ),
      ]);
      if (txRes.ok) setOversightTx((await txRes.json()).transactions || []);
      if (blitsRes.ok) setOversightBlits((await blitsRes.json()).entries || []);
      if (packRes.ok) setOversightPacks((await packRes.json()).campaigns || []);
      if (slotRes.ok) setOversightSlots((await slotRes.json()).slots || []);
      if (!txRes.ok || !blitsRes.ok || !packRes.ok || !slotRes.ok) {
        setError("Some oversight data failed to load. Re-authenticate if your session expired.");
      }
    } finally {
      setOversightLoading(false);
    }
  }, []);

  const loadCore = useCallback(async () => {
    setError("");
    const [aRes, sRes, pRes, socialRes] = await Promise.all([
      fetch("/api/admin/affiliate/affiliates", { cache: "no-store" }),
      fetch("/api/admin/affiliate/sales", { cache: "no-store" }),
      fetch("/api/admin/affiliate/payouts", { cache: "no-store" }),
      fetch("/api/admin/affiliate/social/posts", { cache: "no-store" }),
    ]);
    if (aRes.ok) setAffiliates((await aRes.json()).affiliates || []);
    if (sRes.ok) setSales((await sRes.json()).sales || []);
    if (pRes.ok) setPayouts((await pRes.json()).payouts || []);
    if (socialRes.ok) setSocialPosts((await socialRes.json()).posts || []);
    if (!aRes.ok || !sRes.ok || !pRes.ok || !socialRes.ok) {
      setError("Session expired or access denied. Please authenticate again.");
    }
  }, []);

  const loadDisputes = useCallback(async () => {
    const res = await fetch("/api/admin/affiliate/disputes", { cache: "no-store" });
    if (res.ok) setDisputes((await res.json()).disputes || []);
  }, []);

  const loadBlits = useCallback(async () => {
    const [setRes, gtRes, giftsRes] = await Promise.all([
      fetch("/api/admin/blits/settings", { cache: "no-store" }),
      fetch("/api/admin/blits/gift-types", { cache: "no-store" }),
      fetch("/api/admin/blits/gifts", { cache: "no-store" }),
    ]);
    if (setRes.ok) setBlitsSettings((await setRes.json()).settings || null);
    if (gtRes.ok) setGiftTypes((await gtRes.json()).giftTypes || []);
    if (giftsRes.ok) setGiftEvents((await giftsRes.json()).gifts || []);
  }, []);

  const loadPackLoyaltySettings = useCallback(async () => {
    const res = await fetch("/api/admin/pack-loyalty/settings", { cache: "no-store" });
    if (res.ok) setPackLoyaltySettings((await res.json()).settings || null);
  }, []);

  const loadMessages = useCallback(async () => {
    if (!messageAffiliateId) {
      setMessages([]);
      return;
    }
    const res = await fetch(
      `/api/admin/affiliate/messages?affiliate_id=${encodeURIComponent(messageAffiliateId)}`,
      { cache: "no-store" }
    );
    if (res.ok) setMessages((await res.json()).messages || []);
  }, [messageAffiliateId]);

  useEffect(() => {
    void loadCore();
  }, [loadCore]);

  useEffect(() => {
    if (tab === "oversight") void loadOversight();
  }, [tab, loadOversight]);

  useEffect(() => {
    if (tab === "disputes") void loadDisputes();
    if (tab === "blits") void loadBlits();
    if (tab === "pack_loyalty") void loadPackLoyaltySettings();
  }, [tab, loadDisputes, loadBlits, loadPackLoyaltySettings]);

  useEffect(() => {
    if (tab === "messages" && messageAffiliateId) void loadMessages();
  }, [tab, messageAffiliateId, loadMessages]);

  const patchAffiliate = async (id: string, body: { status?: string; page_enabled?: boolean }) => {
    await fetch(`/api/admin/affiliate/affiliates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await loadCore();
  };

  const processPayout = async (id: string, status: "processing" | "completed" | "failed") => {
    await fetch(`/api/admin/affiliate/payouts/${id}/process`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await loadCore();
  };

  const logoutAdmin = async () => {
    await fetch("/api/admin/auth/session", { method: "DELETE" });
    router.push("/affiliate/admin/auth");
  };

  const moderatePost = async (id: string, status: "approved" | "rejected") => {
    await fetch(`/api/admin/affiliate/social/posts/${id}/moderate`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await loadCore();
  };

  const updateDispute = async (id: string, status: string) => {
    await fetch(`/api/admin/affiliate/disputes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await loadDisputes();
  };

  const sendAdminMessage = async () => {
    if (!messageAffiliateId || !messageDraft.trim()) return;
    await fetch("/api/admin/affiliate/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ affiliate_id: messageAffiliateId, body: messageDraft.trim() }),
    });
    setMessageDraft("");
    await loadMessages();
  };

  const createDispute = async () => {
    if (!disputeDraft.affiliate_id || !disputeDraft.subject || !disputeDraft.body) return;
    await fetch("/api/admin/affiliate/disputes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        affiliate_id: disputeDraft.affiliate_id,
        subject: disputeDraft.subject,
        body: disputeDraft.body,
      }),
    });
    setDisputeDraft({ affiliate_id: "", subject: "", body: "" });
    await loadDisputes();
  };

  const adminClosePackCampaign = async (reason: "cancelled" | "rejected") => {
    const id = adminPackCampaignId.trim();
    if (!id) {
      setError("Enter a pack campaign id (e.g. pcamp_…).");
      return;
    }
    if (
      !window.confirm(
        "Close this pack for all participants? They will be emailed; paid slots get Blits credit where line totals exist. No loyalty penalty."
      )
    ) {
      return;
    }
    setAdminPackClosing(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/pack-campaigns/${encodeURIComponent(id)}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const j = (await res.json()) as { error?: string; refundedSlots?: number };
      if (!res.ok) {
        setError(j.error || "Close failed.");
        return;
      }
      setAdminPackCampaignId("");
    } finally {
      setAdminPackClosing(false);
    }
  };

  const saveAdminPackGift = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const id = adminPackCampaignId.trim();
    if (!id) {
      setError("Enter a pack campaign id above.");
      return;
    }
    setAdminPackGiftSaving(true);
    setError("");
    try {
      const fd = new FormData(e.currentTarget);
      const endsLocal = String(fd.get("admin_gift_ends") || "").trim();
      const prizeRaw = String(fd.get("admin_gift_prize") || "").trim();
      const poolRaw = String(fd.get("admin_gift_pool") || "").trim();
      const alloc = String(fd.get("admin_gift_allocation") || "fixed_per_payment").trim();
      const customRaw = String(fd.get("admin_gift_custom_json") || "").trim();
      let gift_custom_per_size: Record<string, number> | null = null;
      if (customRaw) {
        try {
          const parsed = JSON.parse(customRaw) as unknown;
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            gift_custom_per_size = parsed as Record<string, number>;
          }
        } catch {
          setError("Custom JSON must be valid (variant id → Blits).");
          return;
        }
      }
      const res = await fetch(`/api/admin/pack-campaigns/${encodeURIComponent(id)}/gift`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gift_countdown_ends_at: endsLocal ? new Date(endsLocal).toISOString() : null,
          gift_blits_prize: prizeRaw ? Number(prizeRaw) : null,
          gift_allocation_type: alloc,
          gift_blits_pool: poolRaw ? Number(poolRaw) : null,
          gift_custom_per_size,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(j.error || "Save failed.");
      }
    } finally {
      setAdminPackGiftSaving(false);
    }
  };

  const savePackLoyaltySettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSavingPackLoyalty(true);
    try {
      const fd = new FormData(e.currentTarget);
      const res = await fetch("/api/admin/pack-loyalty/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          starting_loyalty_points: Number(fd.get("starting_loyalty_points")),
          max_loyalty_points: Number(fd.get("max_loyalty_points")),
          leave_penalty_points: Number(fd.get("leave_penalty_points")),
          completion_bonus_points: Number(fd.get("completion_bonus_points")),
          blits_per_loyalty_point: Number(fd.get("blits_per_loyalty_point")),
        }),
      });
      if (res.ok) setPackLoyaltySettings((await res.json()).settings || null);
    } finally {
      setSavingPackLoyalty(false);
    }
  };

  const saveBlitsSettings = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSavingBlits(true);
    try {
      const fd = new FormData(e.currentTarget);
      const purchaseTiersRaw = fd.get("purchase_tiers") as string;
      let purchase_tiers: unknown = blitsSettings?.purchase_tiers;
      if (purchaseTiersRaw?.trim()) {
        try {
          purchase_tiers = JSON.parse(purchaseTiersRaw);
        } catch {
          setError("Purchase tiers must be valid JSON.");
          return;
        }
      }
      const res = await fetch("/api/admin/blits/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usd_to_blits_per_dollar: Number(fd.get("usd_to_blits")),
          blits_per_usd_cashout: Number(fd.get("blits_cashout")),
          product_discount_percent_paying_blits: Number(fd.get("product_discount")),
          purchase_tiers,
        }),
      });
      if (res.ok) setBlitsSettings((await res.json()).settings || null);
    } finally {
      setSavingBlits(false);
    }
  };

  const oversightSubTabs: { key: OversightSubTab; label: string }[] = [
    { key: "storefront", label: "Storefront orders" },
    { key: "blits", label: "Blits ledger" },
    { key: "pack_campaigns", label: "Pack campaigns" },
    { key: "pack_slots", label: "Pack slots" },
  ];

  const tabs: { key: Tab; label: string }[] = [
    { key: "oversight", label: "Platform oversight" },
    { key: "affiliates", label: "Affiliates" },
    { key: "sales", label: "Sales & commission" },
    { key: "payouts", label: "Payouts" },
    { key: "disputes", label: "Disputes" },
    { key: "messages", label: "Messages" },
    { key: "blits", label: "Blits & gifts" },
    { key: "pack_loyalty", label: "Pack loyalty" },
    { key: "social", label: "Social moderation" },
  ];

  return (
    <main className="min-h-screen bg-theme-background px-4 py-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl">Commerce admin</h1>
            <p className="text-sm text-black/55 mt-1">
              Storefront orders, packs, Blits, affiliates, payouts, disputes, and social moderation.
            </p>
          </div>
          <button
            onClick={logoutAdmin}
            className="px-4 py-2 text-xs uppercase tracking-[0.2em] border border-black/20 rounded"
          >
            Logout
          </button>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-black/10 pb-3">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm ${
                tab === t.key ? "bg-theme-primary text-white" : "border border-black/15 text-black/75"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        {tab === "oversight" ? (
          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold text-lg">Platform oversight</h2>
                <p className="text-xs text-black/55 max-w-2xl mt-1">
                  Pick a view below, set filters, then Apply or Refresh all. Campaign IDs can be sent to Pack loyalty →
                  close / early-bird tools.
                </p>
              </div>
              <button
                type="button"
                disabled={oversightLoading}
                onClick={() => void loadOversight()}
                className="px-4 py-2 bg-theme-primary text-white rounded text-sm disabled:opacity-50"
              >
                {oversightLoading ? "Loading…" : "Refresh all"}
              </button>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-black/10 pb-2">
              {oversightSubTabs.map((st) => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setOversightSubTab(st.key)}
                  className={`px-3 py-1.5 rounded-lg text-sm ${
                    oversightSubTab === st.key
                      ? "bg-theme-primary text-white"
                      : "border border-black/15 text-black/75 bg-white"
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <div className="bg-white rounded-lg border border-theme-primary/20 p-5">
              {oversightSubTab === "storefront" ? (
                <>
                  <p className="text-xs text-black/55 mb-3">
                    Orders recorded in the customer account (invoice pipeline). Search by order number, email, or
                    customer id.
                  </p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <input
                      value={ovTxQ}
                      onChange={(e) => setOvTxQ(e.target.value)}
                      placeholder="Search order #, email, customer id…"
                      className="flex-1 min-w-[200px] border border-black/20 rounded px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void loadOversight()}
                      className="px-3 py-2 border border-black/20 rounded text-sm"
                    >
                      Apply
                    </button>
                  </div>
                  <div className="overflow-auto max-h-[min(70vh,560px)]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b border-black/10">
                          <th className="py-2 pr-2">When</th>
                          <th className="py-2 pr-2">Order</th>
                          <th className="py-2 pr-2">Customer</th>
                          <th className="py-2 pr-2">Amount</th>
                          <th className="py-2 pr-2">Status</th>
                          <th className="py-2">Lines</th>
                        </tr>
                      </thead>
                      <tbody>
                        {oversightTx.map((t) => (
                          <tr key={t.id} className="border-b border-black/5 align-top">
                            <td className="py-2 pr-2 whitespace-nowrap text-xs">
                              {new Date(t.created_at).toLocaleString()}
                            </td>
                            <td className="py-2 pr-2 font-mono text-xs">{t.order_number}</td>
                            <td className="py-2 pr-2">
                              <span className="break-all">{t.customer_email}</span>
                              <span className="block text-[11px] text-black/45 font-mono">{t.customer_id}</span>
                            </td>
                            <td className="py-2 pr-2 whitespace-nowrap">
                              {t.amount} {t.currency_code?.toUpperCase()}
                            </td>
                            <td className="py-2 pr-2">{t.status}</td>
                            <td className="py-2 text-xs max-w-[280px]">
                              {(t.line_items || []).length === 0 ? (
                                "—"
                              ) : (
                                <ul className="list-disc pl-4 space-y-0.5">
                                  {(t.line_items || []).map((li) => (
                                    <li key={li.id}>
                                      {li.product_title} × {li.quantity}{" "}
                                      <span className="text-black/45">@ {li.unit_price}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {oversightTx.length === 0 && !oversightLoading ? (
                      <p className="text-xs text-black/50 mt-2">No transactions match.</p>
                    ) : null}
                  </div>
                </>
              ) : null}

              {oversightSubTab === "blits" ? (
                <>
                  <p className="text-xs text-black/55 mb-3">
                    Credits and debits (kind, balance). Search by kind, customer id, email, or metadata text.
                  </p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <input
                      value={ovBlitsQ}
                      onChange={(e) => setOvBlitsQ(e.target.value)}
                      placeholder="Search kind, email, id…"
                      className="flex-1 min-w-[200px] border border-black/20 rounded px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void loadOversight()}
                      className="px-3 py-2 border border-black/20 rounded text-sm"
                    >
                      Apply
                    </button>
                  </div>
                  <div className="overflow-auto max-h-[min(70vh,560px)]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b border-black/10">
                          <th className="py-2 pr-2">When</th>
                          <th className="py-2 pr-2">Kind</th>
                          <th className="py-2 pr-2">Δ / balance</th>
                          <th className="py-2 pr-2">Customer</th>
                          <th className="py-2">Metadata</th>
                        </tr>
                      </thead>
                      <tbody>
                        {oversightBlits.map((r) => (
                          <tr key={r.id} className="border-b border-black/5 align-top">
                            <td className="py-2 pr-2 whitespace-nowrap text-xs">
                              {new Date(r.created_at).toLocaleString()}
                            </td>
                            <td className="py-2 pr-2 font-mono text-xs">{r.kind}</td>
                            <td className="py-2 pr-2 whitespace-nowrap">
                              {r.delta_blits} / {r.balance_after}
                            </td>
                            <td className="py-2 pr-2">
                              <span className="break-all">{r.customer_email || "—"}</span>
                              <span className="block text-[11px] text-black/45 font-mono">{r.customer_id}</span>
                            </td>
                            <td
                              className="py-2 text-[11px] font-mono max-w-[220px] truncate"
                              title={JSON.stringify(r.metadata)}
                            >
                              {JSON.stringify(r.metadata)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {oversightBlits.length === 0 && !oversightLoading ? (
                      <p className="text-xs text-black/50 mt-2">No ledger rows match.</p>
                    ) : null}
                  </div>
                </>
              ) : null}

              {oversightSubTab === "pack_campaigns" ? (
                <>
                  <p className="text-xs text-black/55 mb-3">
                    Wholesale group buys: public code, affiliate, slot counts. Optional status filter (e.g. open,
                    filling, ready_to_process).
                  </p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <input
                      value={ovPackQ}
                      onChange={(e) => setOvPackQ(e.target.value)}
                      placeholder="Search code, title, affiliate…"
                      className="flex-1 min-w-[180px] border border-black/20 rounded px-3 py-2 text-sm"
                    />
                    <input
                      value={ovPackStatus}
                      onChange={(e) => setOvPackStatus(e.target.value)}
                      placeholder="Status (optional)"
                      className="w-40 border border-black/20 rounded px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void loadOversight()}
                      className="px-3 py-2 border border-black/20 rounded text-sm"
                    >
                      Apply
                    </button>
                  </div>
                  <div className="overflow-auto max-h-[min(70vh,560px)]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b border-black/10">
                          <th className="py-2 pr-2">Updated</th>
                          <th className="py-2 pr-2">Campaign</th>
                          <th className="py-2 pr-2">Pack</th>
                          <th className="py-2 pr-2">Affiliate</th>
                          <th className="py-2 pr-2">Status</th>
                          <th className="py-2 pr-2">Slots</th>
                          <th className="py-2">Gift</th>
                        </tr>
                      </thead>
                      <tbody>
                        {oversightPacks.map((c) => (
                          <tr key={c.id} className="border-b border-black/5 align-top">
                            <td className="py-2 pr-2 whitespace-nowrap text-xs">
                              {new Date(c.updated_at).toLocaleString()}
                            </td>
                            <td className="py-2 pr-2">
                              <span className="font-mono text-xs break-all">{c.id}</span>
                              <span className="block text-[11px] text-black/50">#{c.public_code}</span>
                              <button
                                type="button"
                                className="text-[11px] underline text-theme-primary mt-0.5"
                                onClick={() => {
                                  setAdminPackCampaignId(c.id);
                                  setTab("pack_loyalty");
                                }}
                              >
                                Use in Pack loyalty tools
                              </button>
                            </td>
                            <td className="py-2 pr-2">{c.pack_title}</td>
                            <td className="py-2 pr-2">
                              <span className="font-medium">{c.affiliate_code || "—"}</span>
                              <span className="block text-[11px] text-black/50 break-all">{c.affiliate_email || ""}</span>
                            </td>
                            <td className="py-2 pr-2">{c.status}</td>
                            <td className="py-2 pr-2 whitespace-nowrap text-xs">
                              total {c.slot_count} · paid {c.paid_count} · res. {c.reserved_count}
                            </td>
                            <td className="py-2 text-xs max-w-[180px]">
                              {c.gift_allocation_type || "—"}
                              {c.gift_countdown_ends_at ? (
                                <span className="block text-[11px] text-black/50">
                                  ends {new Date(c.gift_countdown_ends_at).toLocaleString()}
                                </span>
                              ) : null}
                              {c.gift_blits_prize ? (
                                <span className="block">prize {c.gift_blits_prize}</span>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {oversightPacks.length === 0 && !oversightLoading ? (
                      <p className="text-xs text-black/50 mt-2">No campaigns match.</p>
                    ) : null}
                  </div>
                </>
              ) : null}

              {oversightSubTab === "pack_slots" ? (
                <>
                  <p className="text-xs text-black/55 mb-3">
                    Per-size rows: collection code, Medusa order id, storefront customer when known. Filter by campaign
                    id or search codes / order / email.
                  </p>
                  <div className="flex flex-wrap gap-2 mb-3">
                    <input
                      value={ovSlotCampaignId}
                      onChange={(e) => setOvSlotCampaignId(e.target.value)}
                      placeholder="Campaign id (optional)"
                      className="flex-1 min-w-[200px] border border-black/20 rounded px-3 py-2 text-xs font-mono"
                    />
                    <input
                      value={ovSlotQ}
                      onChange={(e) => setOvSlotQ(e.target.value)}
                      placeholder="Search collection code, order id, email…"
                      className="flex-1 min-w-[200px] border border-black/20 rounded px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void loadOversight()}
                      className="px-3 py-2 border border-black/20 rounded text-sm"
                    >
                      Apply
                    </button>
                  </div>
                  <div className="overflow-auto max-h-[min(70vh,560px)]">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left border-b border-black/10">
                          <th className="py-2 pr-2">Updated</th>
                          <th className="py-2 pr-2">Slot</th>
                          <th className="py-2 pr-2">Campaign</th>
                          <th className="py-2 pr-2">Size</th>
                          <th className="py-2 pr-2">Status</th>
                          <th className="py-2 pr-2">Order / code</th>
                          <th className="py-2 pr-2">Buyer</th>
                          <th className="py-2">Meta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {oversightSlots.map((s) => (
                          <tr key={s.id} className="border-b border-black/5 align-top">
                            <td className="py-2 pr-2 whitespace-nowrap text-xs">
                              {new Date(s.updated_at).toLocaleString()}
                            </td>
                            <td className="py-2 pr-2 font-mono text-[11px] break-all max-w-[100px]">{s.id}</td>
                            <td className="py-2 pr-2">
                              <span className="text-[11px] font-mono break-all">{s.pack_campaign_id}</span>
                              <span className="block text-[11px] text-black/50">
                                #{s.campaign_public_code} · {s.campaign_status}
                              </span>
                              <span className="block">{s.pack_title}</span>
                              {s.affiliate_code ? (
                                <span className="text-[11px] text-black/50">aff {s.affiliate_code}</span>
                              ) : null}
                            </td>
                            <td className="py-2 pr-2">{s.size_label}</td>
                            <td className="py-2 pr-2">{s.status}</td>
                            <td className="py-2 pr-2 font-mono text-[11px]">
                              {s.collection_code || "—"}
                              <span className="block break-all">{s.order_id || "—"}</span>
                            </td>
                            <td className="py-2 pr-2">
                              <span className="break-all">{s.storefront_email || "—"}</span>
                              <span className="block text-[11px] font-mono text-black/45">{s.customer_id || "—"}</span>
                            </td>
                            <td
                              className="py-2 text-[10px] font-mono max-w-[160px] truncate"
                              title={JSON.stringify(s.metadata)}
                            >
                              {JSON.stringify(s.metadata)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {oversightSlots.length === 0 && !oversightLoading ? (
                      <p className="text-xs text-black/50 mt-2">No slots match.</p>
                    ) : null}
                  </div>
                </>
              ) : null}
            </div>
          </section>
        ) : null}

        {tab === "affiliates" ? (
          <section className="bg-white rounded-lg border border-theme-primary/20 p-5">
            <h2 className="font-semibold mb-2">All affiliates</h2>
            <p className="text-xs text-black/55 mb-4">
              <strong>Available commission</strong> = earnings minus paid out minus pending/processing payouts.{" "}
              <strong>Page off</strong> hides the public affiliate shop; the owner can still use the dashboard.
            </p>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-black/10">
                    <th className="py-2">Affiliate</th>
                    <th className="py-2">Code</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Expected / available</th>
                    <th className="py-2">Page</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {affiliates.map((affiliate) => (
                    <tr key={affiliate.id} className="border-b border-black/5">
                      <td className="py-2">
                        {affiliate.first_name} {affiliate.last_name}
                        <div className="text-black/50">{affiliate.email}</div>
                      </td>
                      <td className="py-2 font-mono text-xs">{affiliate.code}</td>
                      <td className="py-2 capitalize">{affiliate.status}</td>
                      <td className="py-2">
                        <div>${Number(affiliate.total_earnings || 0).toFixed(2)} total commission</div>
                        <div className="text-emerald-800 text-xs">
                          ~${Number(affiliate.available_commission ?? 0).toFixed(2)} available
                        </div>
                      </td>
                      <td className="py-2">{affiliate.page_enabled !== false ? "On" : "Off"}</td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-1">
                          <button
                            type="button"
                            onClick={() => patchAffiliate(affiliate.id, { status: "active" })}
                            className="px-2 py-1 text-xs bg-green-600 text-white rounded"
                          >
                            Activate
                          </button>
                          <button
                            type="button"
                            onClick={() => patchAffiliate(affiliate.id, { status: "inactive" })}
                            className="px-2 py-1 text-xs bg-red-600 text-white rounded"
                          >
                            Disable acct
                          </button>
                          <button
                            type="button"
                            onClick={() => patchAffiliate(affiliate.id, { page_enabled: false })}
                            className="px-2 py-1 text-xs bg-black/70 text-white rounded"
                          >
                            Hide page
                          </button>
                          <button
                            type="button"
                            onClick={() => patchAffiliate(affiliate.id, { page_enabled: true })}
                            className="px-2 py-1 text-xs border border-black/20 rounded"
                          >
                            Show page
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === "sales" ? (
          <section className="bg-white rounded-lg border border-theme-primary/20 p-5">
            <h2 className="font-semibold mb-4">Sales by affiliate</h2>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-black/10">
                    <th className="py-2">Affiliate</th>
                    <th className="py-2">Order</th>
                    <th className="py-2">Order Total</th>
                    <th className="py-2">Commission</th>
                    <th className="py-2">Source</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id} className="border-b border-black/5">
                      <td className="py-2">
                        {sale.code}
                        <div className="text-black/50">{sale.email}</div>
                      </td>
                      <td className="py-2">{sale.order_id}</td>
                      <td className="py-2">${Number(sale.order_total).toFixed(2)}</td>
                      <td className="py-2">${Number(sale.commission_amount).toFixed(2)}</td>
                      <td className="py-2 text-black/70 text-xs">
                        {(() => {
                          let m: Record<string, unknown> | null = null;
                          if (sale.metadata && typeof sale.metadata === "object") {
                            m = sale.metadata as Record<string, unknown>;
                          } else if (typeof sale.metadata === "string") {
                            try {
                              m = JSON.parse(sale.metadata) as Record<string, unknown>;
                            } catch {
                              return "—";
                            }
                          }
                          if (!m) return "—";
                          const src = m.attribution_source ?? m.source;
                          return src ? String(src) : "—";
                        })()}
                      </td>
                      <td className="py-2 capitalize">{sale.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === "payouts" ? (
          <section className="bg-white rounded-lg border border-theme-primary/20 p-5">
            <h2 className="font-semibold mb-4">Payout approvals</h2>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-black/10">
                    <th className="py-2">Affiliate</th>
                    <th className="py-2">Amount</th>
                    <th className="py-2">Method</th>
                    <th className="py-2">Status</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {payouts.map((payout) => (
                    <tr key={payout.id} className="border-b border-black/5">
                      <td className="py-2">
                        {payout.code}
                        <div className="text-black/50">{payout.email}</div>
                      </td>
                      <td className="py-2">${Number(payout.amount).toFixed(2)}</td>
                      <td className="py-2">{payout.method}</td>
                      <td className="py-2 capitalize">{payout.status}</td>
                      <td className="py-2">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => processPayout(payout.id, "processing")}
                            className="px-2 py-1 text-xs bg-amber-600 text-white rounded"
                          >
                            Processing
                          </button>
                          <button
                            type="button"
                            onClick={() => processPayout(payout.id, "completed")}
                            className="px-2 py-1 text-xs bg-green-600 text-white rounded"
                          >
                            Approve / complete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {tab === "disputes" ? (
          <section className="bg-white rounded-lg border border-theme-primary/20 p-5 space-y-6">
            <div>
              <h2 className="font-semibold mb-2">Disputes</h2>
              <p className="text-xs text-black/55 mb-4">Open cases; mark resolved when handled.</p>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-black/10">
                      <th className="py-2">Affiliate</th>
                      <th className="py-2">Subject</th>
                      <th className="py-2">Status</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {disputes.map((d) => (
                      <tr key={d.id} className="border-b border-black/5 align-top">
                        <td className="py-2">
                          {d.code || d.affiliate_id}
                          <div className="text-black/50 text-xs">{d.affiliate_email}</div>
                        </td>
                        <td className="py-2 max-w-xs">
                          <div className="font-medium">{d.subject}</div>
                          <div className="text-black/60 text-xs line-clamp-2">{d.body}</div>
                        </td>
                        <td className="py-2 capitalize">{d.status}</td>
                        <td className="py-2">
                          <div className="flex flex-wrap gap-1">
                            <button
                              type="button"
                              onClick={() => updateDispute(d.id, "resolved")}
                              className="px-2 py-1 text-xs bg-green-600 text-white rounded"
                            >
                              Resolved
                            </button>
                            <button
                              type="button"
                              onClick={() => updateDispute(d.id, "dismissed")}
                              className="px-2 py-1 text-xs border border-black/20 rounded"
                            >
                              Dismiss
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="border-t border-black/10 pt-4">
              <h3 className="text-sm font-medium mb-2">Log internal dispute (optional)</h3>
              <div className="grid gap-2 max-w-lg">
                <input
                  placeholder="Affiliate id (UUID)"
                  className="border border-black/20 rounded px-3 py-2 text-sm"
                  value={disputeDraft.affiliate_id}
                  onChange={(e) => setDisputeDraft((p) => ({ ...p, affiliate_id: e.target.value }))}
                />
                <input
                  placeholder="Subject"
                  className="border border-black/20 rounded px-3 py-2 text-sm"
                  value={disputeDraft.subject}
                  onChange={(e) => setDisputeDraft((p) => ({ ...p, subject: e.target.value }))}
                />
                <textarea
                  placeholder="Details"
                  className="border border-black/20 rounded px-3 py-2 text-sm"
                  rows={3}
                  value={disputeDraft.body}
                  onChange={(e) => setDisputeDraft((p) => ({ ...p, body: e.target.value }))}
                />
                <button
                  type="button"
                  onClick={createDispute}
                  className="px-4 py-2 bg-theme-primary text-white rounded text-sm w-fit"
                >
                  Create dispute record
                </button>
              </div>
            </div>
          </section>
        ) : null}

        {tab === "messages" ? (
          <section className="bg-white rounded-lg border border-theme-primary/20 p-5 space-y-4">
            <h2 className="font-semibold">Messages to affiliates</h2>
            <p className="text-xs text-black/55">
              Select an affiliate by ID (from the Affiliates table), then send an internal note. In-app affiliate
              inbox UI can be wired to this API later.
            </p>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="text-xs text-black/55 block mb-1">Affiliate id</label>
                <input
                  className="w-full border border-black/20 rounded px-3 py-2 text-sm font-mono"
                  value={messageAffiliateId}
                  onChange={(e) => setMessageAffiliateId(e.target.value)}
                  placeholder="uuid"
                />
              </div>
              <button
                type="button"
                onClick={() => loadMessages()}
                className="px-3 py-2 border border-black/20 rounded text-sm"
              >
                Load thread
              </button>
            </div>
            <div className="border border-black/10 rounded p-3 max-h-64 overflow-y-auto space-y-2 bg-black/[0.02]">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`text-sm p-2 rounded ${m.from_admin ? "bg-theme-primary/10 ml-8" : "bg-white mr-8 border border-black/10"}`}
                >
                  <span className="text-[10px] uppercase text-black/45">
                    {m.from_admin ? "Admin" : "Affiliate"} · {new Date(m.created_at).toLocaleString()}
                  </span>
                  <p>{m.body}</p>
                </div>
              ))}
              {messageAffiliateId && messages.length === 0 ? (
                <p className="text-xs text-black/50">No messages yet.</p>
              ) : null}
            </div>
            <div className="flex gap-2">
              <input
                className="flex-1 border border-black/20 rounded px-3 py-2 text-sm"
                placeholder="Type a message…"
                value={messageDraft}
                onChange={(e) => setMessageDraft(e.target.value)}
              />
              <button
                type="button"
                onClick={sendAdminMessage}
                className="px-4 py-2 bg-theme-primary text-white rounded text-sm"
              >
                Send
              </button>
            </div>
          </section>
        ) : null}

        {tab === "blits" ? (
          <section className="bg-white rounded-lg border border-theme-primary/20 p-5 space-y-8">
            <div>
              <h2 className="font-semibold mb-1">Blits (virtual currency)</h2>
              <p className="text-xs text-black/55 mb-4">
                Configure conversion rates, checkout loyalty discount when customers pay with Blits, and
                TikTok-style gift types for affiliate photo galleries. Customers add Blits from their account
                (wallet line added to cart) and pay at checkout; Blits credit after payment completes.
              </p>
              {blitsSettings ? (
                <form onSubmit={saveBlitsSettings} className="grid gap-3 max-w-xl">
                  <label className="text-sm">
                    USD → Blits per $1
                    <input
                      name="usd_to_blits"
                      type="number"
                      step="1"
                      min="1"
                      defaultValue={String(blitsSettings.usd_to_blits_per_dollar ?? 100)}
                      className="mt-1 w-full border border-black/20 rounded px-3 py-2"
                    />
                  </label>
                  <label className="text-sm">
                    Blits per $1 cash-out
                    <input
                      name="blits_cashout"
                      type="number"
                      step="1"
                      min="1"
                      defaultValue={String(blitsSettings.blits_per_usd_cashout ?? 100)}
                      className="mt-1 w-full border border-black/20 rounded px-3 py-2"
                    />
                  </label>
                  <label className="text-sm">
                    Extra discount when paying with Blits (%)
                    <input
                      name="product_discount"
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      defaultValue={String(blitsSettings.product_discount_percent_paying_blits ?? 0)}
                      className="mt-1 w-full border border-black/20 rounded px-3 py-2"
                    />
                  </label>
                  <label className="text-sm">
                    Purchase tiers (JSON array: usd, blits, label, bonus_percent)
                    <textarea
                      name="purchase_tiers"
                      rows={8}
                      defaultValue={JSON.stringify(blitsSettings.purchase_tiers || [], null, 2)}
                      className="mt-1 w-full border border-black/20 rounded px-3 py-2 font-mono text-xs"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={savingBlits}
                    className="px-4 py-2 bg-theme-primary text-white rounded text-sm w-fit"
                  >
                    {savingBlits ? "Saving…" : "Save Blits settings"}
                  </button>
                </form>
              ) : (
                <p className="text-sm text-black/55">Loading…</p>
              )}
            </div>

            <div>
              <h3 className="font-semibold mb-2">Gift types (TikTok-style)</h3>
              <p className="text-xs text-black/55 mb-3">Shown on live / photo gifting UI; cost is in Blits.</p>
              <div className="overflow-auto mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-black/10">
                      <th className="py-2">Name</th>
                      <th className="py-2">Emoji</th>
                      <th className="py-2">Blits</th>
                      <th className="py-2">Active</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {giftTypes.map((g) => (
                      <tr key={g.id} className="border-b border-black/5">
                        <td className="py-2">{g.name}</td>
                        <td className="py-2">{g.emoji || "—"}</td>
                        <td className="py-2">{g.cost_blits}</td>
                        <td className="py-2">{g.active ? "Yes" : "No"}</td>
                        <td className="py-2">
                          <button
                            type="button"
                            onClick={async () => {
                              await fetch(`/api/admin/blits/gift-types/${g.id}`, {
                                method: "PATCH",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ active: !g.active }),
                              });
                              await loadBlits();
                            }}
                            className="text-xs underline"
                          >
                            Toggle
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <AddGiftForm onCreated={loadBlits} />
            </div>

            <div>
              <h3 className="font-semibold mb-2">Recent photo gifts</h3>
              <p className="text-xs text-black/55 mb-3">
                Gifts sent from affiliate shop photo galleries (customer Blits deducted; monitor for fraud).
              </p>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b border-black/10">
                      <th className="py-2 pr-2">When</th>
                      <th className="py-2 pr-2">Affiliate</th>
                      <th className="py-2 pr-2">Blits</th>
                      <th className="py-2 pr-2">Post</th>
                      <th className="py-2">Gift type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {giftEvents.map((ev) => (
                      <tr key={ev.id} className="border-b border-black/5">
                        <td className="py-2 pr-2 whitespace-nowrap">
                          {new Date(ev.created_at).toLocaleString()}
                        </td>
                        <td className="py-2 pr-2">
                          <span className="font-medium">{ev.affiliate_code}</span>
                          <span className="block text-[11px] text-black/50">{ev.affiliate_email}</span>
                        </td>
                        <td className="py-2 pr-2">{ev.blits_spent}</td>
                        <td className="py-2 pr-2 font-mono text-[11px] max-w-[120px] truncate">
                          {ev.post_id || "—"}
                        </td>
                        <td className="py-2 font-mono text-[11px] max-w-[100px] truncate">{ev.gift_type_id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {giftEvents.length === 0 ? (
                  <p className="text-xs text-black/50 mt-2">No gifts recorded yet.</p>
                ) : null}
              </div>
            </div>
          </section>
        ) : null}

        {tab === "pack_loyalty" ? (
          <section className="bg-white rounded-lg border border-theme-primary/20 p-5 space-y-4">
            <h2 className="font-semibold mb-1">Wholesale pack loyalty</h2>
            <p className="text-xs text-black/55 mb-4 max-w-2xl">
              Customers earn pack loyalty points (default start 100, cap 200). Leaving a pack applies a penalty.
              When every size in a group pack is paid, participants get a completion bonus. They can redeem points
              for Blits at the rate below and use Blits at checkout.
            </p>
            {packLoyaltySettings ? (
              <form onSubmit={savePackLoyaltySettings} className="grid gap-3 max-w-xl">
                <label className="text-sm">
                  Starting points (new accounts)
                  <input
                    name="starting_loyalty_points"
                    type="number"
                    step="1"
                    min="0"
                    defaultValue={String(packLoyaltySettings.starting_loyalty_points ?? 100)}
                    className="mt-1 w-full border border-black/20 rounded px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  Maximum points (cap)
                  <input
                    name="max_loyalty_points"
                    type="number"
                    step="1"
                    min="1"
                    defaultValue={String(packLoyaltySettings.max_loyalty_points ?? 200)}
                    className="mt-1 w-full border border-black/20 rounded px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  Points deducted when leaving a pack
                  <input
                    name="leave_penalty_points"
                    type="number"
                    step="1"
                    min="0"
                    defaultValue={String(packLoyaltySettings.leave_penalty_points ?? 5)}
                    className="mt-1 w-full border border-black/20 rounded px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  Bonus points when pack completes (all sizes paid)
                  <input
                    name="completion_bonus_points"
                    type="number"
                    step="1"
                    min="0"
                    defaultValue={String(packLoyaltySettings.completion_bonus_points ?? 2)}
                    className="mt-1 w-full border border-black/20 rounded px-3 py-2"
                  />
                </label>
                <label className="text-sm">
                  Blits credited per loyalty point redeemed
                  <input
                    name="blits_per_loyalty_point"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={String(packLoyaltySettings.blits_per_loyalty_point ?? 1)}
                    className="mt-1 w-full border border-black/20 rounded px-3 py-2"
                  />
                </label>
                <button
                  type="submit"
                  disabled={savingPackLoyalty}
                  className="px-4 py-2 bg-theme-primary text-white rounded text-sm w-fit"
                >
                  {savingPackLoyalty ? "Saving…" : "Save pack loyalty settings"}
                </button>
              </form>
            ) : (
              <p className="text-sm text-black/55">Loading…</p>
            )}

            <div className="border-t border-black/10 pt-6 mt-6 max-w-xl">
              <h3 className="font-semibold mb-1">Close pack by campaign ID</h3>
              <p className="text-xs text-black/55 mb-3">
                Cancels or rejects a pack for all participants (emails from the same transactional sender as the AI
                agent / info inbox). Credits Blits for paid slots when line totals were stored at checkout.
              </p>
              <div className="flex flex-wrap gap-2 items-end">
                <label className="text-sm flex-1 min-w-[200px]">
                  Campaign id
                  <input
                    value={adminPackCampaignId}
                    onChange={(e) => setAdminPackCampaignId(e.target.value)}
                    placeholder="pcamp_…"
                    className="mt-1 w-full border border-black/20 rounded px-3 py-2 font-mono text-xs"
                  />
                </label>
                <button
                  type="button"
                  disabled={adminPackClosing}
                  onClick={() => void adminClosePackCampaign("cancelled")}
                  className="px-4 py-2 border border-amber-600 text-amber-900 rounded text-sm disabled:opacity-50"
                >
                  {adminPackClosing ? "…" : "Cancel pack"}
                </button>
                <button
                  type="button"
                  disabled={adminPackClosing}
                  onClick={() => void adminClosePackCampaign("rejected")}
                  className="px-4 py-2 border border-red-500 text-red-900 rounded text-sm disabled:opacity-50"
                >
                  Reject pack
                </button>
              </div>
              <form onSubmit={saveAdminPackGift} className="mt-5 space-y-3 max-w-xl">
                <h4 className="text-sm font-semibold">Early-bird Blits (same campaign id)</h4>
                <p className="text-xs text-black/55">
                  Fixed = Blits per payment; equal/fcfs = total pool after deadline; custom = JSON map of variant id →
                  Blits. Clear deadline and all amounts to remove. Pool settlement runs after the countdown (webhook or
                  pack page load).
                </p>
                <label className="text-sm block">
                  Allocation
                  <select
                    name="admin_gift_allocation"
                    className="mt-1 w-full border border-black/20 rounded px-3 py-2"
                    defaultValue="fixed_per_payment"
                  >
                    <option value="fixed_per_payment">Fixed per payment</option>
                    <option value="equal_pool">Equal pool</option>
                    <option value="fcfs_pool">FCFS pool</option>
                    <option value="custom_per_size">Custom per variant</option>
                  </select>
                </label>
                <label className="text-sm block">
                  Pay-by deadline (local)
                  <input
                    name="admin_gift_ends"
                    type="datetime-local"
                    className="mt-1 w-full border border-black/20 rounded px-3 py-2"
                  />
                </label>
                <label className="text-sm block">
                  Fixed Blits prize
                  <input
                    name="admin_gift_prize"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="—"
                    className="mt-1 w-full border border-black/20 rounded px-3 py-2"
                  />
                </label>
                <label className="text-sm block">
                  Pool (equal / fcfs)
                  <input
                    name="admin_gift_pool"
                    type="number"
                    min={1}
                    step={1}
                    placeholder="—"
                    className="mt-1 w-full border border-black/20 rounded px-3 py-2"
                  />
                </label>
                <label className="text-sm block">
                  Custom JSON
                  <textarea
                    name="admin_gift_custom_json"
                    rows={3}
                    placeholder='{"variant_xxx": 500}'
                    className="mt-1 w-full border border-black/20 rounded px-3 py-2 text-xs font-mono"
                  />
                </label>
                <button
                  type="submit"
                  disabled={adminPackGiftSaving}
                  className="px-4 py-2 bg-theme-primary text-white rounded text-sm disabled:opacity-50"
                >
                  {adminPackGiftSaving ? "Saving…" : "Save early-bird Blits"}
                </button>
              </form>
            </div>
          </section>
        ) : null}

        {tab === "social" ? (
          <section className="bg-white rounded-lg border border-theme-primary/20 p-5">
            <h2 className="font-semibold mb-4">Social Commerce Moderation</h2>
            <div className="space-y-4">
              {socialPosts.length === 0 ? (
                <p className="text-sm text-black/60">No pending social posts.</p>
              ) : (
                socialPosts.map((post) => (
                  <div key={post.id} className="border border-black/10 rounded p-4">
                    <div className="flex justify-between gap-3 mb-2 text-sm">
                      <p>
                        <span className="font-medium">{post.code}</span> • {post.email}
                      </p>
                      <p className="text-black/50">{new Date(post.created_at).toLocaleString()}</p>
                    </div>
                    <img
                      src={post.image_url}
                      alt="Pending affiliate post"
                      className="w-full max-h-64 object-cover rounded border border-black/10 mb-2"
                    />
                    <p className="text-sm mb-3">{post.caption}</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => moderatePost(post.id, "approved")}
                        className="px-3 py-1 text-xs bg-green-600 text-white rounded"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => moderatePost(post.id, "rejected")}
                        className="px-3 py-1 text-xs bg-red-600 text-white rounded"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function AddGiftForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("");
  const [cost, setCost] = useState(100);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await fetch("/api/admin/blits/gift-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, emoji: emoji || null, cost_blits: cost }),
      });
      setName("");
      setEmoji("");
      setCost(100);
      onCreated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap gap-2 items-end max-w-xl">
      <input
        placeholder="Gift name"
        className="border border-black/20 rounded px-3 py-2 text-sm flex-1 min-w-[120px]"
        value={name}
        onChange={(e) => setName(e.target.value)}
        required
      />
      <input
        placeholder="Emoji"
        className="border border-black/20 rounded px-3 py-2 text-sm w-20"
        value={emoji}
        onChange={(e) => setEmoji(e.target.value)}
      />
      <input
        type="number"
        min={1}
        className="border border-black/20 rounded px-3 py-2 text-sm w-28"
        value={cost}
        onChange={(e) => setCost(Number(e.target.value))}
      />
      <button
        type="submit"
        disabled={busy}
        className="px-4 py-2 border border-black/20 rounded text-sm"
      >
        Add gift
      </button>
    </form>
  );
}
