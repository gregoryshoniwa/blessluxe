"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Coins,
  Gift,
  History,
  Info,
  Loader2,
  Plus,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { addBlitsTopupToCart } from "@/lib/blits-topup";

type AccountPayload = {
  customer: {
    id: string;
    email: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    avatar_url?: string;
    bio?: string;
    address?: CustomerAddress;
    email_verified?: boolean;
    metadata?: Record<string, unknown> | null;
  } | null;
  transactions?: Array<Record<string, unknown>>;
  tickets?: Array<Record<string, unknown>>;
  inbox?: Array<Record<string, unknown>>;
};

type CustomerAddress = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
};

type WallPost = Record<string, unknown> & { comments?: Array<Record<string, unknown>> };

type PackParticipationRow = {
  id: string;
  pack_definition_id: string;
  public_code: string;
  status: string;
  slot_id: string;
  size_label: string;
  slot_status: string;
  slot_collection_code?: string | null;
  pack_title: string | null;
  affiliate_code: string | null;
  updated_at?: string;
};

const tabs = [
  "Profile",
  "Transactions",
  "Blits",
  "Packs",
  "Tickets",
  "Affiliate",
  "Wall",
  "Inbox",
] as const;

function AccountPageContent() {
  const router = useRouter();
  const { data: oauthSession } = useSession();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Profile");
  const [payload, setPayload] = useState<AccountPayload | null>(null);
  const [posts, setPosts] = useState<WallPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const oauthSyncInFlight = useRef(false);

  const [commentDraft, setCommentDraft] = useState<Record<string, string>>({});

  const [blitsBalance, setBlitsBalance] = useState<number | null>(null);
  const [blitsLedger, setBlitsLedger] = useState<
    Array<{
      id: string;
      delta_blits: string;
      balance_after: string;
      kind: string;
      created_at: string;
    }>
  >([]);
  const [blitsPublic, setBlitsPublic] = useState<{
    settings?: {
      usd_to_blits_per_dollar: number;
      purchase_tiers?: Array<{ usd?: number; blits?: number; label?: string }>;
    } | null;
  } | null>(null);
  const [blitsLoading, setBlitsLoading] = useState(false);
  const [customUsd, setCustomUsd] = useState("");
  const [blitsSubTab, setBlitsSubTab] = useState<"add" | "activity" | "payout">("add");

  const [packParticipations, setPackParticipations] = useState<PackParticipationRow[]>([]);
  const [packsTabLoading, setPacksTabLoading] = useState(false);
  const [packLoyaltySnapshot, setPackLoyaltySnapshot] = useState<{
    loyalty_points: number;
    settings: {
      max_loyalty_points: number;
      blits_per_loyalty_point: number;
    } | null;
  } | null>(null);
  const [redeemPoints, setRedeemPoints] = useState("");
  const [redeemBusy, setRedeemBusy] = useState(false);
  const [packPrivacyDisplay, setPackPrivacyDisplay] = useState<"name" | "code">("name");
  const [packPrivacyBusy, setPackPrivacyBusy] = useState(false);

  const searchParams = useSearchParams();

  const customer = payload?.customer || null;

  const name = useMemo(() => {
    if (!customer) return "";
    return customer.full_name || `${customer.first_name || ""} ${customer.last_name || ""}`.trim() || customer.email;
  }, [customer]);

  const packPublicDisplayFromServer = useMemo(() => {
    const m = customer?.metadata;
    if (!m || typeof m !== "object" || Array.isArray(m)) return undefined;
    return (m as Record<string, unknown>).pack_public_display;
  }, [customer?.metadata]);

  useEffect(() => {
    setPackPrivacyDisplay(packPublicDisplayFromServer === "code" ? "code" : "name");
  }, [customer?.id, packPublicDisplayFromServer]);

  const loadAccount = async () => {
    setLoading(true);
    setError("");
    try {
      const meRes = await fetch("/api/account/me", { cache: "no-store" });
      const meJson = (await meRes.json()) as AccountPayload;
      setPayload(meJson);
      const postsRes = await fetch("/api/account/posts", { cache: "no-store" });
      const postsJson = (await postsRes.json()) as { posts: WallPost[] };
      setPosts(postsJson.posts || []);
    } catch {
      setError("Unable to load account data right now.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccount();
  }, []);

  useEffect(() => {
    const tab = searchParams.get("tab");
    const sub = searchParams.get("sub");
    const map: Record<string, (typeof tabs)[number]> = {
      profile: "Profile",
      transactions: "Transactions",
      blits: "Blits",
      packs: "Packs",
      tickets: "Tickets",
      affiliate: "Affiliate",
      wall: "Wall",
      inbox: "Inbox",
    };
    if (tab) {
      const key = tab.toLowerCase();
      if (map[key]) setActiveTab(map[key]);
    }
    if (tab?.toLowerCase() === "blits") {
      if (sub === "activity") setBlitsSubTab("activity");
      else if (sub === "payout") setBlitsSubTab("payout");
      else setBlitsSubTab("add");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!customer || activeTab !== "Blits") return;
    let cancelled = false;
    (async () => {
      setBlitsLoading(true);
      try {
        const [wRes, pRes] = await Promise.all([
          fetch("/api/blits/wallet", { cache: "no-store" }),
          fetch("/api/blits/public", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (wRes.ok) {
          const w = (await wRes.json()) as { balance?: number; ledger?: typeof blitsLedger };
          setBlitsBalance(Number(w.balance ?? 0));
          setBlitsLedger(Array.isArray(w.ledger) ? w.ledger : []);
        } else {
          setBlitsBalance(null);
          setBlitsLedger([]);
        }
        if (pRes.ok) {
          setBlitsPublic(await pRes.json());
        }
      } finally {
        if (!cancelled) setBlitsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customer, activeTab]);

  useEffect(() => {
    if (!customer || activeTab !== "Packs") return;
    let cancelled = false;
    (async () => {
      setPacksTabLoading(true);
      try {
        const [pRes, lRes] = await Promise.all([
          fetch("/api/account/packs", { cache: "no-store" }),
          fetch("/api/account/pack-loyalty", { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (pRes.ok) {
          const data = (await pRes.json()) as { participations?: PackParticipationRow[] };
          setPackParticipations(Array.isArray(data.participations) ? data.participations : []);
        } else {
          setPackParticipations([]);
        }
        if (lRes.ok) {
          const lj = (await lRes.json()) as {
            loyalty_points?: number;
            settings?: { max_loyalty_points: number; blits_per_loyalty_point: number } | null;
          };
          setPackLoyaltySnapshot({
            loyalty_points: Number(lj.loyalty_points ?? 0),
            settings: lj.settings ?? null,
          });
        } else {
          setPackLoyaltySnapshot(null);
        }
      } finally {
        if (!cancelled) setPacksTabLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customer, activeTab]);

  useEffect(() => {
    const syncOauthSession = async () => {
      if (!oauthSession?.user?.email || customer || oauthSyncInFlight.current) return;
      oauthSyncInFlight.current = true;
      try {
        const syncRes = await fetch("/api/account/session-sync", { method: "POST" });
        if (syncRes.ok) {
          await loadAccount();
        }
      } finally {
        oauthSyncInFlight.current = false;
      }
    };
    syncOauthSession();
  }, [customer, oauthSession?.user?.email]);

  const onRedeemPackLoyalty = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const n = Number(redeemPoints);
    if (!Number.isFinite(n) || n <= 0) {
      setError("Enter a valid number of points to redeem.");
      return;
    }
    setRedeemBusy(true);
    setError("");
    setNote("");
    try {
      const res = await fetch("/api/account/pack-loyalty", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ points: Math.floor(n) }),
      });
      const j = (await res.json()) as { error?: string; loyalty_points?: number; blits_credited?: string };
      if (!res.ok) {
        setError(j.error || "Redeem failed.");
        return;
      }
      setNote(`Redeemed — ${j.blits_credited ?? ""} Blits added to your wallet.`);
      setRedeemPoints("");
      if (typeof j.loyalty_points === "number") {
        setPackLoyaltySnapshot((prev) =>
          prev ? { ...prev, loyalty_points: j.loyalty_points! } : prev
        );
      }
    } catch {
      setError("Redeem failed.");
    } finally {
      setRedeemBusy(false);
    }
  };

  const onSavePackPrivacy = async (next: "name" | "code") => {
    if (!customer) return;
    setPackPrivacyBusy(true);
    try {
      const res = await fetch("/api/account/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          metadataPatch: { pack_public_display: next === "code" ? "code" : "name" },
        }),
      });
      if (!res.ok) {
        setError("Could not save pack display preference.");
        return;
      }
      setPackPrivacyDisplay(next);
      setNote("Pack page privacy updated.");
      await loadAccount();
    } catch {
      setError("Could not save pack display preference.");
    } finally {
      setPackPrivacyBusy(false);
    }
  };

  const onLogout = async () => {
    await signOut({ redirect: false });
    await fetch("/api/account/logout", { method: "POST" });
    await loadAccount();
  };

  const onSaveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await fetch("/api/account/me", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        fullName: form.get("fullName"),
        avatarUrl: form.get("avatarUrl"),
        bio: form.get("bio"),
        address: {
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          phone: form.get("phone"),
          address1: form.get("address1"),
          address2: form.get("address2"),
          city: form.get("city"),
          province: form.get("province"),
          postalCode: form.get("postalCode"),
          country: form.get("country"),
        },
      }),
    });
    setNote("Profile updated.");
    await loadAccount();
  };

  const onCreateTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const subject = String(form.get("subject") || "");
    const message = String(form.get("message") || "");
    const res = await fetch("/api/account/tickets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject, message }),
    });
    if (res.ok) {
      setNote("Ticket created. Our team will reply soon.");
      event.currentTarget.reset();
      await loadAccount();
    } else {
      setError("Unable to create ticket.");
    }
  };

  const onCreatePost = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const content = String(form.get("content") || "");
    const imageUrl = String(form.get("imageUrl") || "");
    const res = await fetch("/api/account/posts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, imageUrl }),
    });
    if (res.ok) {
      setNote("Posted on your page.");
      event.currentTarget.reset();
      await loadAccount();
    } else {
      setError("Unable to publish post.");
    }
  };

  const onComment = async (postId: string) => {
    const content = commentDraft[postId] || "";
    if (!content.trim()) return;
    const res = await fetch(`/api/account/posts/${postId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (res.ok) {
      setCommentDraft((prev) => ({ ...prev, [postId]: "" }));
      await loadAccount();
    }
  };

  const onMarkRead = async (id: string) => {
    await fetch("/api/account/inbox", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await loadAccount();
  };

  const goToCheckoutForBlitsTopup = (amountUsd: number) => {
    setError("");
    if (!addBlitsTopupToCart(amountUsd)) {
      setError("Invalid USD amount.");
      return;
    }
    router.push("/checkout");
  };

  if (loading) {
    return <div className="px-[5%] py-20 text-center text-black/60">Loading account...</div>;
  }

  return (
    <div className="px-[5%] py-14 md:py-20 space-y-8">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <p className="font-script text-3xl text-gold mb-2">Your Space</p>
          <h1 className="font-display text-3xl tracking-widest uppercase">Customer Account</h1>
          <p className="text-black/60 mt-2">
            Orders, Blits wallet, invoices, support, affiliate tools, profile, social page, and inbox in one place.
          </p>
        </div>
        {customer ? (
          <button
            onClick={onLogout}
            className="border border-black/20 px-6 py-3 text-xs tracking-[0.25em] uppercase hover:bg-black/5 transition-colors"
          >
            Logout
          </button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {note ? <p className="text-sm text-emerald-700">{note}</p> : null}

      {!customer ? (
        <div className="max-w-2xl border border-black/10 p-8 space-y-4 bg-white">
          <h2 className="font-display text-2xl tracking-widest uppercase">Login Required</h2>
          <p className="text-black/65 text-sm">
            Your account dashboard is available after login. Use secure sign-in or create a new account.
          </p>
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => router.push("/account/login")}
              className="bg-black text-white px-6 py-3 text-xs tracking-[0.2em] uppercase"
            >
              Login
            </button>
            <button
              onClick={() => router.push("/account/signup")}
              className="border border-black/20 px-6 py-3 text-xs tracking-[0.2em] uppercase"
            >
              Create Account
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="border border-black/10 p-5 flex items-center gap-4">
            <img
              src={customer.avatar_url || "https://placehold.co/120x120?text=Avatar"}
              alt="Profile avatar"
              className="w-16 h-16 rounded-full object-cover border border-black/10"
            />
            <div>
              <p className="font-semibold">{name}</p>
              <p className="text-sm text-black/60">{customer.email}</p>
              <p className="text-xs text-black/50 mt-1">
                {customer.email_verified ? "Email verified" : "Email not verified"}
              </p>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-xs tracking-[0.2em] uppercase border ${
                  activeTab === tab ? "border-gold bg-gold/10" : "border-black/20"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {activeTab === "Profile" ? (
            <form onSubmit={onSaveProfile} className="grid md:grid-cols-2 gap-4 border border-black/10 p-6">
              <input name="fullName" defaultValue={customer.full_name || ""} placeholder="Full name" className="border border-black/20 px-4 py-3 text-sm" />
              <input name="avatarUrl" defaultValue={customer.avatar_url || ""} placeholder="Avatar image URL" className="border border-black/20 px-4 py-3 text-sm" />
              <input name="firstName" defaultValue={String(customer.address?.firstName || customer.first_name || "")} placeholder="First name" className="border border-black/20 px-4 py-3 text-sm" />
              <input name="lastName" defaultValue={String(customer.address?.lastName || customer.last_name || "")} placeholder="Last name" className="border border-black/20 px-4 py-3 text-sm" />
              <input name="phone" defaultValue={String(customer.address?.phone || "")} placeholder="Phone" className="border border-black/20 px-4 py-3 text-sm" />
              <input name="address1" defaultValue={String(customer.address?.address1 || "")} placeholder="Address line 1" className="border border-black/20 px-4 py-3 text-sm" />
              <input name="address2" defaultValue={String(customer.address?.address2 || "")} placeholder="Address line 2" className="border border-black/20 px-4 py-3 text-sm" />
              <input name="city" defaultValue={String(customer.address?.city || "")} placeholder="City" className="border border-black/20 px-4 py-3 text-sm" />
              <input name="province" defaultValue={String(customer.address?.province || "")} placeholder="Province/State" className="border border-black/20 px-4 py-3 text-sm" />
              <input name="postalCode" defaultValue={String(customer.address?.postalCode || "")} placeholder="Postal code" className="border border-black/20 px-4 py-3 text-sm" />
              <input name="country" defaultValue={String(customer.address?.country || "Zimbabwe")} placeholder="Country" className="border border-black/20 px-4 py-3 text-sm" />
              <textarea name="bio" defaultValue={customer.bio || ""} placeholder="Short bio (your personal page intro)" className="border border-black/20 px-4 py-3 text-sm md:col-span-2 min-h-24" />
              <button type="submit" className="md:col-span-2 bg-gold text-white py-3 text-xs tracking-[0.2em] uppercase hover:bg-gold-dark transition-colors">
                Save Profile & Address
              </button>
            </form>
          ) : null}

          {activeTab === "Transactions" ? (
            <div className="border border-black/10 p-6 space-y-3">
              {(payload?.transactions || []).map((tx) => (
                <div key={String(tx.id)} className="border border-black/10 p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold">{String(tx.order_number)}</p>
                    <p className="text-xs text-black/60">{new Date(String(tx.created_at)).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">
                      {String(tx.currency_code || "usd").toUpperCase()} {Number(tx.amount || 0).toFixed(2)}
                    </p>
                    <p className="text-xs uppercase tracking-[0.2em]">{String(tx.status || "paid")}</p>
                    <a href={String(tx.invoice_url || "#")} className="text-xs text-gold underline">Invoice</a>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {activeTab === "Blits" ? (
            <div className="space-y-6 border border-black/10 bg-white p-6">
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-black/10 pb-5">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center border border-gold/25 bg-cream-dark/80 text-gold">
                    <Wallet className="h-5 w-5" strokeWidth={1.5} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display text-lg tracking-widest uppercase text-black/90">Blits wallet</h3>
                    <p className="mt-1 text-sm text-black/55">
                      Use Blits for creator gifts and{" "}
                      <span className="text-gold-dark">Pay with Blits</span> at checkout.
                    </p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {blitsLoading ? (
                    <div className="flex h-10 items-center justify-end">
                      <Loader2 className="h-5 w-5 animate-spin text-gold" aria-label="Loading balance" />
                    </div>
                  ) : (
                    <>
                      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-black/40">Balance</p>
                      <p className="mt-0.5 font-display text-2xl text-gold">
                        {blitsBalance !== null ? blitsBalance.toLocaleString() : "—"}
                        <span className="ml-1.5 text-sm font-body font-normal text-black/45">Blits</span>
                      </p>
                    </>
                  )}
                </div>
              </div>

              {!blitsLoading ? (
                <>
                  <div className="flex flex-wrap gap-2 border-b border-black/10 pb-5">
                    <button
                      type="button"
                      onClick={() => setBlitsSubTab("add")}
                      className={`px-4 py-2 text-xs tracking-[0.2em] uppercase border ${
                        blitsSubTab === "add" ? "border-gold bg-gold/10" : "border-black/20"
                      }`}
                    >
                      Add Blits (USD)
                    </button>
                    <button
                      type="button"
                      onClick={() => setBlitsSubTab("activity")}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs tracking-[0.2em] uppercase border ${
                        blitsSubTab === "activity" ? "border-gold bg-gold/10" : "border-black/20"
                      }`}
                    >
                      <History className="h-3.5 w-3.5" />
                      Recent activity
                    </button>
                    <button
                      type="button"
                      onClick={() => setBlitsSubTab("payout")}
                      className={`px-4 py-2 text-xs tracking-[0.2em] uppercase border ${
                        blitsSubTab === "payout" ? "border-gold bg-gold/10" : "border-black/20"
                      }`}
                    >
                      Payout
                    </button>
                  </div>

                  {blitsSubTab === "add" ? (
                    <div className="space-y-4 border border-black/8 bg-cream/40 p-5">
                      <div className="flex gap-3 text-sm text-black/70">
                        <Info className="mt-0.5 h-4 w-4 shrink-0 text-black/40" />
                        <p className="text-xs text-black/55">
                          We add a wallet line to your cart. Complete checkout with card, mobile money, or bank transfer.
                          Your Blits balance updates after payment. (Wallet top-ups cannot use “Pay with Blits”.)
                        </p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {(Array.isArray(blitsPublic?.settings?.purchase_tiers)
                          ? blitsPublic.settings!.purchase_tiers!
                          : []
                        ).map((tier) => {
                          const usd = Number(tier.usd);
                          const blits = Number(tier.blits);
                          const label = tier.label || `$${usd}`;
                          if (!Number.isFinite(usd) || usd <= 0) return null;
                          return (
                            <button
                              key={`${usd}-${label}`}
                              type="button"
                              onClick={() => goToCheckoutForBlitsTopup(usd)}
                              className="group flex flex-col items-start gap-0.5 border border-black/12 bg-white px-3 py-2.5 text-left transition hover:border-gold/40 hover:bg-gold/5"
                            >
                              <span className="text-sm font-medium text-black/85">{label}</span>
                              {Number.isFinite(blits) ? (
                                <span className="flex items-center gap-1 text-[11px] text-black/50">
                                  {blits.toLocaleString()} Blits
                                  <ArrowRight className="h-3 w-3 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-80" />
                                </span>
                              ) : null}
                              <span className="text-[10px] uppercase tracking-wider text-gold">Add to cart & checkout</span>
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <div className="min-w-0 flex-1">
                          <label className="mb-1 text-xs font-medium text-black/50">Custom USD amount</label>
                          <input
                            type="number"
                            min={0.01}
                            step={0.01}
                            value={customUsd}
                            onChange={(e) => setCustomUsd(e.target.value)}
                            className="w-full border border-black/15 bg-white px-3 py-2.5 text-sm focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold/30"
                            placeholder="e.g. 15"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={!customUsd.trim()}
                          onClick={() => {
                            const n = Number(customUsd);
                            if (!Number.isFinite(n) || n <= 0) {
                              setError("Enter a valid USD amount.");
                              return;
                            }
                            goToCheckoutForBlitsTopup(n);
                          }}
                          className="inline-flex items-center justify-center gap-2 bg-gold px-5 py-2.5 text-xs font-semibold tracking-[0.2em] text-white transition hover:bg-gold-dark disabled:opacity-50"
                        >
                          Add to cart & checkout
                        </button>
                      </div>
                    </div>
                  ) : blitsSubTab === "activity" ? (
                    <div className="border border-black/8 bg-cream/30 p-5">
                      {blitsLedger.length === 0 ? (
                        <div className="border border-dashed border-black/12 bg-white/60 py-8 text-center">
                          <p className="text-sm text-black/50">No wallet movements yet.</p>
                          <p className="mt-1 text-xs text-black/40">Gifts and purchases appear here.</p>
                        </div>
                      ) : (
                        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                          {blitsLedger.map((row) => {
                            const kind = row.kind;
                            const positive = Number(row.delta_blits) >= 0;
                            const Icon =
                              kind === "gift_sent"
                                ? Gift
                                : kind === "checkout_payment"
                                  ? ShoppingBag
                                  : kind === "purchase_direct" || kind === "purchase_checkout"
                                    ? Plus
                                    : Coins;
                            return (
                              <div
                                key={row.id}
                                className="flex items-center justify-between gap-3 border border-black/8 bg-white px-3 py-2.5 text-xs"
                              >
                                <div className="flex min-w-0 items-center gap-2.5">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center border border-black/8 bg-cream text-black/55">
                                    <Icon className="h-3.5 w-3.5" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-medium capitalize text-black/80">{kind.replace(/_/g, " ")}</p>
                                    <p className="text-[11px] text-black/45">{new Date(row.created_at).toLocaleString()}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p
                                    className={`text-sm font-medium ${positive ? "text-gold-dark" : "text-black/55"}`}
                                  >
                                    {positive ? "+" : ""}
                                    {row.delta_blits}
                                  </p>
                                  <p className="text-[10px] text-black/40">Balance {row.balance_after}</p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3 border border-black/8 bg-cream/40 p-5 text-sm text-black/70">
                      <p className="font-medium text-black/85">Cash out Blits</p>
                      <p className="text-xs text-black/55">
                        Payouts to your bank or mobile wallet are processed manually. Open a support ticket with your
                        payout details and preferred method; our team will confirm using your account settings.
                      </p>
                      <Link
                        href="/account?tab=tickets"
                        className="inline-block border border-gold bg-gold/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-black/85 transition hover:bg-gold/20"
                      >
                        Open support ticket
                      </Link>
                    </div>
                  )}
                </>
              ) : null}
            </div>
          ) : null}

          {activeTab === "Packs" ? (
            <div className="border border-black/10 p-6 space-y-4">
              <div>
                <h3 className="font-display tracking-widest uppercase">Wholesale group packs</h3>
                <p className="mt-1 text-sm text-black/60">
                  Sizes you claimed in affiliate group packs. Open the shared page to see the full group status.
                </p>
              </div>

              <div className="rounded-lg border border-black/10 bg-white/90 px-4 py-4 space-y-3">
                <p className="text-xs uppercase tracking-[0.2em] text-black/45">How you appear on pack pages</p>
                <p className="text-sm text-black/65">
                  Other participants can see who holds each size. Choose whether to show your name or only your
                  collection code.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={packPrivacyBusy}
                    onClick={() => void onSavePackPrivacy("name")}
                    className={`rounded-lg border px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                      packPrivacyDisplay === "name"
                        ? "border-gold bg-gold/15 text-black/90"
                        : "border-black/15 text-black/60 hover:bg-black/5"
                    } disabled:opacity-50`}
                  >
                    Show my name
                  </button>
                  <button
                    type="button"
                    disabled={packPrivacyBusy}
                    onClick={() => void onSavePackPrivacy("code")}
                    className={`rounded-lg border px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                      packPrivacyDisplay === "code"
                        ? "border-gold bg-gold/15 text-black/90"
                        : "border-black/15 text-black/60 hover:bg-black/5"
                    } disabled:opacity-50`}
                  >
                    Code only
                  </button>
                </div>
              </div>

              {!packsTabLoading && packLoyaltySnapshot ? (
                <div className="border border-gold/30 bg-cream/50 p-4 space-y-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-black/45">Pack loyalty</p>
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="font-display text-3xl text-gold-dark">{packLoyaltySnapshot.loyalty_points}</p>
                      <p className="text-xs text-black/50 mt-1">
                        Max {packLoyaltySnapshot.settings?.max_loyalty_points ?? 200} points · redeem for Blits (
                        {packLoyaltySnapshot.settings?.blits_per_loyalty_point ?? 1} Blits per point)
                      </p>
                    </div>
                    <form onSubmit={onRedeemPackLoyalty} className="flex flex-wrap items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={redeemPoints}
                        onChange={(e) => setRedeemPoints(e.target.value)}
                        placeholder="Points"
                        className="w-24 border border-black/20 px-3 py-2 text-sm"
                      />
                      <button
                        type="submit"
                        disabled={redeemBusy}
                        className="bg-gold text-white px-4 py-2 text-xs uppercase tracking-[0.15em] disabled:opacity-50"
                      >
                        {redeemBusy ? "…" : "Redeem to Blits"}
                      </button>
                    </form>
                  </div>
                  <p className="text-xs text-black/45">
                    Use Blits at checkout (e.g. Pay with Blits) for discounts on eligible orders.
                  </p>
                </div>
              ) : null}

              {packsTabLoading ? (
                <div className="flex items-center gap-2 text-sm text-black/50">
                  <Loader2 className="h-4 w-4 animate-spin text-gold" aria-hidden />
                  Loading your packs…
                </div>
              ) : packParticipations.length === 0 ? (
                <p className="text-sm text-black/55 border border-dashed border-black/15 bg-cream/40 px-4 py-8 text-center">
                  You haven&apos;t joined a group pack yet. When you pick a size on an affiliate&apos;s pack link and
                  complete checkout, it will show here.
                </p>
              ) : (
                <ul className="space-y-3">
                  {packParticipations.map((row) => {
                    const packHref =
                      row.affiliate_code && row.public_code
                        ? `/affiliate/shop/${encodeURIComponent(row.affiliate_code)}/pack/${encodeURIComponent(row.public_code)}`
                        : null;
                    const title = row.pack_title || "Pack";
                    return (
                      <li
                        key={`${row.id}-${row.slot_id}`}
                        className="flex flex-wrap items-start justify-between gap-3 border border-black/10 p-4 bg-white"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-black/90">{title}</p>
                          <p className="text-xs text-black/50 mt-0.5">
                            Your size: <span className="font-medium text-black/70">{row.size_label}</span> · Slot:{" "}
                            <span className="uppercase tracking-wide">{row.slot_status}</span>
                          </p>
                          <p className="text-xs text-black/45 mt-1">
                            Campaign: <span className="uppercase tracking-wide">{row.status}</span>
                            {row.updated_at ? ` · ${new Date(row.updated_at).toLocaleString()}` : null}
                          </p>
                          {row.slot_collection_code ? (
                            <p className="text-xs font-mono text-black/75 mt-2">
                              Collection code: {row.slot_collection_code}
                              <span className="block text-[11px] text-black/45 font-sans mt-0.5">
                                Show this when collecting or to verify your item. Emailed to you after payment.
                              </span>
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap gap-2 shrink-0">
                          {packHref ? (
                            <Link
                              href={packHref}
                              className="inline-flex items-center gap-1.5 border border-gold bg-gold/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-black/85 hover:bg-gold/20"
                            >
                              Open pack page
                              <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
                            </Link>
                          ) : null}
                          <Link
                            href="/shop/packs"
                            className="inline-flex items-center border border-black/15 px-3 py-2 text-xs uppercase tracking-[0.15em] text-black/70 hover:bg-black/5"
                          >
                            Browse packs
                          </Link>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}

          {activeTab === "Tickets" ? (
            <div className="grid md:grid-cols-2 gap-5">
              <form onSubmit={onCreateTicket} className="border border-black/10 p-5 space-y-3">
                <h3 className="font-display tracking-widest uppercase">Open Query Ticket</h3>
                <input name="subject" required placeholder="Subject" className="w-full border border-black/20 px-4 py-3 text-sm" />
                <textarea name="message" required placeholder="How can we help?" className="w-full border border-black/20 px-4 py-3 text-sm min-h-28" />
                <button type="submit" className="w-full bg-gold text-white py-3 text-xs tracking-[0.2em] uppercase">Submit Ticket</button>
              </form>
              <div className="border border-black/10 p-5 space-y-3">
                <h3 className="font-display tracking-widest uppercase">Ticket History</h3>
                {(payload?.tickets || []).map((ticket) => (
                  <div key={String(ticket.id)} className="border border-black/10 p-3">
                    <p className="font-medium">{String(ticket.subject)}</p>
                    <p className="text-xs text-black/70 mt-1">{String(ticket.message)}</p>
                    <p className="text-xs text-black/50 mt-2 uppercase tracking-[0.2em]">{String(ticket.status)}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {activeTab === "Affiliate" ? (
            <div className="border border-black/10 p-6 space-y-3">
              <h3 className="font-display tracking-widest uppercase">Affiliate Options</h3>
              <p className="text-sm text-black/70">Use your profile email in the affiliate dashboard to track referrals and payouts.</p>
              <div className="flex gap-3 flex-wrap">
                <Link href={`/affiliate/dashboard?email=${encodeURIComponent(customer.email)}`} className="bg-gold text-white px-5 py-3 text-xs tracking-[0.2em] uppercase">
                  Open Affiliate Dashboard
                </Link>
                <Link href="/affiliate/apply" className="border border-black/20 px-5 py-3 text-xs tracking-[0.2em] uppercase">
                  Apply / Update Affiliate
                </Link>
              </div>
            </div>
          ) : null}

          {activeTab === "Wall" ? (
            <div className="space-y-4">
              <form onSubmit={onCreatePost} className="border border-black/10 p-5 grid gap-3">
                <h3 className="font-display tracking-widest uppercase">Personal Page (Wall)</h3>
                <textarea name="content" required placeholder="Share an update..." className="border border-black/20 px-4 py-3 text-sm min-h-24" />
                <input name="imageUrl" placeholder="Photo URL (optional)" className="border border-black/20 px-4 py-3 text-sm" />
                <button type="submit" className="bg-gold text-white py-3 text-xs tracking-[0.2em] uppercase">Post</button>
              </form>
              {posts.map((post) => (
                <div key={String(post.id)} className="border border-black/10 p-5 space-y-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={String(post.avatar_url || "https://placehold.co/80x80?text=U")}
                      alt="Post author avatar"
                      className="w-10 h-10 rounded-full object-cover border border-black/10"
                    />
                    <div>
                      <p className="font-semibold">{String(post.full_name || "Customer")}</p>
                      <p className="text-xs text-black/60">{new Date(String(post.created_at)).toLocaleString()}</p>
                    </div>
                  </div>
                  <p className="text-sm">{String(post.content || "")}</p>
                  {post.image_url ? (
                    <img src={String(post.image_url)} alt="Post attachment" className="w-full max-h-80 object-cover border border-black/10" />
                  ) : null}
                  <div className="space-y-2">
                    {(post.comments || []).map((comment) => (
                      <p key={String(comment.id)} className="text-sm text-black/80 border-l-2 border-black/10 pl-3">
                        <span className="font-medium">{String(comment.full_name || "User")}:</span> {String(comment.content || "")}
                      </p>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={commentDraft[String(post.id)] || ""}
                      onChange={(event) =>
                        setCommentDraft((prev) => ({
                          ...prev,
                          [String(post.id)]: event.target.value,
                        }))
                      }
                      placeholder="Write a comment..."
                      className="flex-1 border border-black/20 px-4 py-2 text-sm"
                    />
                    <button
                      onClick={() => onComment(String(post.id))}
                      className="border border-black/20 px-4 py-2 text-xs tracking-[0.2em] uppercase"
                    >
                      Comment
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {activeTab === "Inbox" ? (
            <div className="border border-black/10 p-5 space-y-3">
              <h3 className="font-display tracking-widest uppercase">Messages & Notifications</h3>
              {(payload?.inbox || []).map((item) => (
                <div key={String(item.id)} className="border border-black/10 p-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{String(item.title)}</p>
                    <p className="text-sm text-black/70">{String(item.body)}</p>
                    <p className="text-xs uppercase tracking-[0.2em] text-black/50 mt-1">{String(item.category)}</p>
                  </div>
                  {!Boolean(item.is_read) ? (
                    <button onClick={() => onMarkRead(String(item.id))} className="text-xs underline">
                      Mark read
                    </button>
                  ) : (
                    <span className="text-xs text-black/50">Read</span>
                  )}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={<div className="px-[5%] py-20 text-center text-black/60">Loading account…</div>}>
      <AccountPageContent />
    </Suspense>
  );
}
