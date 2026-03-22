"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Tab =
  | "affiliates"
  | "sales"
  | "payouts"
  | "disputes"
  | "messages"
  | "blits"
  | "social";

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
    if (tab === "disputes") void loadDisputes();
    if (tab === "blits") void loadBlits();
  }, [tab, loadDisputes, loadBlits]);

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

  const tabs: { key: Tab; label: string }[] = [
    { key: "affiliates", label: "Affiliates" },
    { key: "sales", label: "Sales & commission" },
    { key: "payouts", label: "Payouts" },
    { key: "disputes", label: "Disputes" },
    { key: "messages", label: "Messages" },
    { key: "blits", label: "Blits & gifts" },
    { key: "social", label: "Social moderation" },
  ];

  return (
    <main className="min-h-screen bg-theme-background px-4 py-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl">Commerce admin</h1>
            <p className="text-sm text-black/55 mt-1">
              Affiliates, payouts, disputes, Blits (virtual currency), and social moderation.
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
