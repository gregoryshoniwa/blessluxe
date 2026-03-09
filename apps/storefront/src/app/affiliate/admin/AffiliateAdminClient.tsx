"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
}

interface Sale {
  id: string;
  code: string;
  email: string;
  order_id: string;
  order_total: string;
  commission_amount: string;
  status: string;
}

interface Payout {
  id: string;
  code: string;
  email: string;
  amount: string;
  method: string;
  status: string;
}

export default function AffiliateAdminClient() {
  const router = useRouter();
  const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    const [aRes, sRes, pRes] = await Promise.all([
      fetch("/api/admin/affiliate/affiliates", { cache: "no-store" }),
      fetch("/api/admin/affiliate/sales", { cache: "no-store" }),
      fetch("/api/admin/affiliate/payouts", { cache: "no-store" }),
    ]);
    if (aRes.ok) setAffiliates((await aRes.json()).affiliates || []);
    if (sRes.ok) setSales((await sRes.json()).sales || []);
    if (pRes.ok) setPayouts((await pRes.json()).payouts || []);
    if (!aRes.ok || !sRes.ok || !pRes.ok) {
      setError("Session expired or access denied. Please authenticate again.");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const setStatus = async (id: string, status: "active" | "inactive" | "pending") => {
    await fetch(`/api/admin/affiliate/applications/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
  };

  const processPayout = async (id: string, status: "processing" | "completed" | "failed") => {
    await fetch(`/api/admin/affiliate/payouts/${id}/process`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
  };

  const logoutAdmin = async () => {
    await fetch("/api/admin/auth/session", { method: "DELETE" });
    router.push("/affiliate/admin/auth");
  };

  return (
    <main className="min-h-screen bg-theme-background px-4 py-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-3xl">Affiliate Admin</h1>
          <button
            onClick={logoutAdmin}
            className="px-4 py-2 text-xs uppercase tracking-[0.2em] border border-black/20 rounded"
          >
            Logout Admin
          </button>
        </div>

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <section className="bg-white rounded-lg border border-theme-primary/20 p-5">
          <h2 className="font-semibold mb-4">Affiliates</h2>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-black/10">
                  <th className="py-2">Affiliate</th>
                  <th className="py-2">Code</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Earnings</th>
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
                    <td className="py-2">{affiliate.code}</td>
                    <td className="py-2 capitalize">{affiliate.status}</td>
                    <td className="py-2">${Number(affiliate.total_earnings).toFixed(2)}</td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => setStatus(affiliate.id, "active")}
                          className="px-2 py-1 text-xs bg-green-600 text-white rounded"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setStatus(affiliate.id, "inactive")}
                          className="px-2 py-1 text-xs bg-red-600 text-white rounded"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-lg border border-theme-primary/20 p-5">
          <h2 className="font-semibold mb-4">Sales by Affiliate</h2>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-black/10">
                  <th className="py-2">Affiliate</th>
                  <th className="py-2">Order</th>
                  <th className="py-2">Order Total</th>
                  <th className="py-2">Commission</th>
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
                    <td className="py-2 capitalize">{sale.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-lg border border-theme-primary/20 p-5">
          <h2 className="font-semibold mb-4">Payouts</h2>
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
                          onClick={() => processPayout(payout.id, "processing")}
                          className="px-2 py-1 text-xs bg-amber-600 text-white rounded"
                        >
                          Processing
                        </button>
                        <button
                          onClick={() => processPayout(payout.id, "completed")}
                          className="px-2 py-1 text-xs bg-green-600 text-white rounded"
                        >
                          Complete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

