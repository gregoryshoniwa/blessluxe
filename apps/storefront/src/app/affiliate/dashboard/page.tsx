"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

type PayoutMethod = "bank_transfer" | "paypal" | "stripe";

interface StatsResponse {
  affiliate: {
    id: string;
    code: string;
    name: string;
    email: string;
    status: string;
  };
  stats: {
    totalEarnings: number;
    availableBalance: number;
    totalSales: number;
    commissionRate: number;
    minPayoutThreshold: number;
  };
  chart: Array<{ day: string; amount: number }>;
  payoutHistory: Array<{
    id: string;
    amount: string;
    method: string;
    status: string;
    created_at: string;
  }>;
  link: string;
}

interface SalesResponse {
  sales: Array<{
    id: string;
    order_id: string;
    order_total: string;
    commission_amount: string;
    status: string;
    created_at: string;
  }>;
}

function Chart({ points }: { points: Array<{ day: string; amount: number }> }) {
  const max = Math.max(...points.map((p) => p.amount), 1);
  return (
    <div className="flex items-end gap-1 h-40">
      {points.map((point) => (
        <div
          key={point.day}
          className="flex-1 bg-theme-primary/80 rounded-t"
          style={{ height: `${Math.max(4, (point.amount / max) * 100)}%` }}
          title={`${point.day}: $${point.amount.toFixed(2)}`}
        />
      ))}
    </div>
  );
}

export default function AffiliateDashboardPage() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const code = searchParams.get("code") || "";

  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [sales, setSales] = useState<SalesResponse["sales"]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>("bank_transfer");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [payoutMsg, setPayoutMsg] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!email && !code) {
        setLoading(false);
        return;
      }

      const idQuery = email ? `email=${encodeURIComponent(email)}` : `code=${encodeURIComponent(code)}`;
      const [statsRes, salesRes] = await Promise.all([
        fetch(`/api/affiliate/stats?${idQuery}`, { cache: "no-store" }),
        fetch(`/api/affiliate/sales?${idQuery}`, { cache: "no-store" }),
      ]);

      if (statsRes.ok) setStats((await statsRes.json()) as StatsResponse);
      if (salesRes.ok) setSales(((await salesRes.json()) as SalesResponse).sales || []);
      setLoading(false);
    };
    load();
  }, [email, code]);

  const qrUrl = useMemo(() => {
    if (!stats?.link) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(
      stats.link
    )}`;
  }, [stats?.link]);

  const submitPayout = async () => {
    setPayoutMsg(null);
    if (!stats) return;
    const response = await fetch("/api/affiliate/payout/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: stats.affiliate.email,
        amount: Number(payoutAmount),
        method: payoutMethod,
        notes: payoutNote,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setPayoutMsg(payload.error || "Payout request failed.");
      return;
    }
    setPayoutAmount("");
    setPayoutNote("");
    setPayoutMsg("Payout request submitted.");
  };

  if (loading) {
    return <main className="min-h-screen p-8">Loading affiliate dashboard...</main>;
  }
  if (!stats) {
    return (
      <main className="min-h-screen p-8">
        Affiliate not found. Open with `?email=your-email@example.com`.
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-theme-background px-4 py-8">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="font-display text-3xl">Affiliate Dashboard</h1>
          <p className="text-black/60 mt-1">
            Welcome {stats.affiliate.name} ({stats.affiliate.status})
          </p>
        </header>

        <section className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-theme-primary/20 p-4">
            <p className="text-sm text-black/60">Total Earnings</p>
            <p className="text-2xl font-semibold">${stats.stats.totalEarnings.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-lg border border-theme-primary/20 p-4">
            <p className="text-sm text-black/60">Available Balance</p>
            <p className="text-2xl font-semibold">${stats.stats.availableBalance.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-lg border border-theme-primary/20 p-4">
            <p className="text-sm text-black/60">Total Sales</p>
            <p className="text-2xl font-semibold">${stats.stats.totalSales.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-lg border border-theme-primary/20 p-4">
            <p className="text-sm text-black/60">Commission Rate</p>
            <p className="text-2xl font-semibold">{stats.stats.commissionRate}%</p>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-lg border border-theme-primary/20 p-5">
            <h2 className="font-semibold mb-3">Affiliate Link</h2>
            <div className="flex gap-2">
              <input
                value={stats.link}
                readOnly
                className="flex-1 px-3 py-2 border border-black/20 rounded-md text-sm"
              />
              <button
                onClick={async () => {
                  await navigator.clipboard.writeText(stats.link);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1200);
                }}
                className="px-4 py-2 bg-theme-primary text-white rounded-md"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="text-xs text-black/50 mt-2">Affiliate code: {stats.affiliate.code}</p>
          </div>

          <div className="bg-white rounded-lg border border-theme-primary/20 p-5 flex items-center justify-center">
            {qrUrl ? <img src={qrUrl} alt="Affiliate link QR code" width={160} height={160} /> : null}
          </div>
        </section>

        <section className="bg-white rounded-lg border border-theme-primary/20 p-5">
          <h2 className="font-semibold mb-3">Earnings (Last 30 Days)</h2>
          <Chart points={stats.chart} />
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border border-theme-primary/20 p-5">
            <h2 className="font-semibold mb-3">Recent Sales</h2>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b border-black/10">
                    <th className="py-2">Order</th>
                    <th className="py-2">Total</th>
                    <th className="py-2">Commission</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.slice(0, 8).map((sale) => (
                    <tr key={sale.id} className="border-b border-black/5">
                      <td className="py-2">{sale.order_id}</td>
                      <td className="py-2">${Number(sale.order_total).toFixed(2)}</td>
                      <td className="py-2">${Number(sale.commission_amount).toFixed(2)}</td>
                      <td className="py-2 capitalize">{sale.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-theme-primary/20 p-5 space-y-4">
            <h2 className="font-semibold">Request Payout</h2>
            <p className="text-sm text-black/60">
              Minimum payout: ${stats.stats.minPayoutThreshold.toFixed(2)}
            </p>
            <input
              type="number"
              min={stats.stats.minPayoutThreshold}
              value={payoutAmount}
              onChange={(e) => setPayoutAmount(e.target.value)}
              placeholder="Amount"
              className="w-full px-3 py-2 border border-black/20 rounded-md"
            />
            <select
              value={payoutMethod}
              onChange={(e) => setPayoutMethod(e.target.value as PayoutMethod)}
              className="w-full px-3 py-2 border border-black/20 rounded-md"
            >
              <option value="bank_transfer">Bank Transfer</option>
              <option value="paypal">PayPal</option>
              <option value="stripe">Stripe</option>
            </select>
            <textarea
              value={payoutNote}
              onChange={(e) => setPayoutNote(e.target.value)}
              rows={3}
              placeholder="Payment details / notes"
              className="w-full px-3 py-2 border border-black/20 rounded-md"
            />
            <button
              onClick={submitPayout}
              className="w-full bg-theme-primary text-white py-2.5 rounded-md font-semibold"
            >
              Request Payout
            </button>
            {payoutMsg ? <p className="text-sm text-theme-primary">{payoutMsg}</p> : null}

            <div>
              <h3 className="font-medium mt-2 mb-2">Payout History</h3>
              <ul className="space-y-1 text-sm">
                {stats.payoutHistory.slice(0, 6).map((payout) => (
                  <li key={payout.id} className="flex justify-between">
                    <span>
                      ${Number(payout.amount).toFixed(2)} • {payout.method}
                    </span>
                    <span className="capitalize">{payout.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
