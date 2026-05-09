"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Circle, MapPin, Truck, Package as PackageIcon, Sparkles } from "lucide-react";
import { PackageQR } from "@/components/tracking/PackageQR";
import { BrandLoader } from "@/components/layout/BrandLoader";
import { MEDUSA_BACKEND_URL, getStoreMedusaFetchHeaders } from "@/lib/medusa";

interface PackageItem {
  id: string;
  product_title: string;
  variant_title: string | null;
  sku: string | null;
  quantity: number;
  sub_code: string | null;
  status: string;
  claimed_at: string | null;
  is_yours?: boolean;
}

interface PackageEvent {
  id: string;
  status: string;
  location: string | null;
  notes: string | null;
  created_at: string;
}

interface PackageView {
  id: string;
  package_code: string;
  status: string;
  carrier: string | null;
  carrier_tracking_number: string | null;
  current_location: string | null;
  estimated_delivery_at: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  is_pack: boolean;
  shipping_address: Record<string, unknown> | null;
  order_number: string;
  customer_email: string | null;
  created_at: string;
  items: PackageItem[];
  events: PackageEvent[];
}

const STATUS_FLOW = [
  { key: "created", label: "Order received" },
  { key: "label_printed", label: "Label printed" },
  { key: "picked", label: "Picked from atelier" },
  { key: "packed", label: "Packed" },
  { key: "shipped", label: "Shipped" },
  { key: "in_transit", label: "In transit" },
  { key: "out_for_delivery", label: "Out for delivery" },
  { key: "delivered", label: "Delivered" },
];

const formatDate = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export default function TrackingPage() {
  const params = useParams<{ code: string }>();
  const code = params?.code?.toUpperCase() || "";
  const [pkg, setPkg] = useState<PackageView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const url = new URL(`/store/packages/${encodeURIComponent(code)}`, MEDUSA_BACKEND_URL);
        const res = await fetch(url.toString(), {
          cache: "no-store",
          headers: getStoreMedusaFetchHeaders(),
        });
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(data?.error || "Tracking code not found.");
          return;
        }
        if (!cancelled) setPkg(data.package);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load package.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (loading) return <BrandLoader label="Looking up your package" />;

  if (error || !pkg) {
    return (
      <main className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <p className="font-script text-3xl text-gold mb-2">Tracking</p>
          <h1 className="font-display text-2xl tracking-widest uppercase mb-4">
            Code Not Found
          </h1>
          <p className="text-black/60 mb-6">{error || "We couldn't find a package with that code."}</p>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-black/40 mb-6">{code}</p>
          <Link
            href="/account"
            className="inline-block bg-gold text-white px-6 py-3 text-xs tracking-[0.2em] uppercase hover:bg-gold-dark transition-colors"
          >
            Open your account
          </Link>
        </div>
      </main>
    );
  }

  const flowIndex = STATUS_FLOW.findIndex((s) => s.key === pkg.status);
  const isTerminal = pkg.status === "delivered";

  // Convert event entries into a per-status timestamp map for the visual timeline.
  const eventByStatus = pkg.events.reduce<Record<string, PackageEvent>>((acc, e) => {
    if (!acc[e.status]) acc[e.status] = e;
    return acc;
  }, {});

  return (
    <main className="min-h-screen bg-cream py-12 md:py-16">
      <div className="max-w-[1100px] mx-auto px-[5%] space-y-8">
        {/* Header */}
        <header className="bg-white border border-black/10 p-6 md:p-8 grid md:grid-cols-[auto_1fr_auto] gap-6 md:gap-8 items-start">
          <PackageQR
            value={`${typeof window !== "undefined" ? window.location.origin : ""}/track/${pkg.package_code}`}
            size={140}
            caption={pkg.package_code}
          />

          <div className="min-w-0">
            <p className="font-script text-2xl text-gold mb-2">Tracking</p>
            <h1 className="font-display text-3xl md:text-4xl tracking-widest uppercase">
              {pkg.is_pack ? "Pack Collection" : "Order"}
            </h1>
            <p className="mt-2 text-sm text-black/60">
              Order <span className="font-mono">{pkg.order_number}</span> · Started{" "}
              {formatDate(pkg.created_at)}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Pill tone={isTerminal ? "success" : "active"}>
                {(STATUS_FLOW.find((s) => s.key === pkg.status)?.label || pkg.status).toString()}
              </Pill>
              {pkg.is_pack && <Pill tone="gold">Pack collection</Pill>}
              {pkg.carrier && <Pill tone="muted">{pkg.carrier}</Pill>}
            </div>
            {pkg.estimated_delivery_at && !isTerminal && (
              <p className="mt-3 text-sm text-black/70">
                <Truck className="inline-block mr-1.5 h-3.5 w-3.5" />
                Expected by{" "}
                <span className="font-medium">{formatDate(pkg.estimated_delivery_at)}</span>
              </p>
            )}
          </div>

          <div className="text-right text-xs text-black/60 max-w-[220px]">
            <p className="font-display tracking-widest uppercase text-black/80 mb-2">Shipping to</p>
            {pkg.shipping_address ? (
              <ShippingAddress address={pkg.shipping_address} />
            ) : (
              <p className="text-black/40">— address withheld —</p>
            )}
          </div>
        </header>

        {/* Status timeline */}
        <section className="bg-white border border-black/10 p-6 md:p-8">
          <div className="flex items-baseline justify-between gap-4 mb-6">
            <div>
              <p className="font-script text-2xl text-gold">Journey</p>
              <h2 className="font-display tracking-widest uppercase text-lg">Status timeline</h2>
            </div>
            {pkg.current_location && (
              <p className="text-xs text-black/60 inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" /> {pkg.current_location}
              </p>
            )}
          </div>

          <ol className="space-y-3">
            {STATUS_FLOW.map((step, i) => {
              const reached = flowIndex >= i;
              const event = eventByStatus[step.key];
              const isCurrent = flowIndex === i && !isTerminal;
              return (
                <li key={step.key} className="flex items-start gap-4">
                  <span
                    className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full transition-colors ${
                      reached
                        ? "bg-gold text-white"
                        : "bg-black/5 text-black/30"
                    }`}
                    aria-hidden
                  >
                    {reached ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <Circle className="h-3.5 w-3.5" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm ${
                        reached ? "text-black font-medium" : "text-black/40"
                      } ${isCurrent ? "text-gold-dark" : ""}`}
                    >
                      {step.label}
                    </p>
                    {event && (
                      <p className="mt-0.5 text-xs text-black/55">
                        {formatDate(event.created_at)}
                        {event.location ? ` · ${event.location}` : ""}
                        {event.notes ? ` · ${event.notes}` : ""}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Items */}
        <section className="bg-white border border-black/10 p-6 md:p-8">
          <div className="flex items-baseline justify-between gap-4 mb-5">
            <div>
              <p className="font-script text-2xl text-gold">Inside</p>
              <h2 className="font-display tracking-widest uppercase text-lg">
                {pkg.is_pack ? "Pack contents" : "Items"}
              </h2>
            </div>
            <span className="text-xs text-black/60">{pkg.items.length} pieces</span>
          </div>

          <ul className="divide-y divide-black/10">
            {pkg.items.map((item) => (
              <li key={item.id} className="py-4 flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{item.product_title}</p>
                  {item.variant_title && (
                    <p className="text-xs text-black/60">{item.variant_title}</p>
                  )}
                  <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-black/40">
                    SKU {item.sku || "—"} · qty {item.quantity}
                  </p>
                </div>

                {item.sub_code && (
                  <div
                    className={`text-right ${
                      item.is_yours === false ? "opacity-50" : ""
                    }`}
                  >
                    <p className="text-[10px] uppercase tracking-[0.2em] text-gold-dark">
                      {item.is_yours === false ? "Belongs to" : "Your sub-code"}
                    </p>
                    <p className="mt-1 font-mono text-sm font-semibold">
                      {item.is_yours === false ? "another customer" : item.sub_code}
                    </p>
                    {item.status === "claimed" && (
                      <p className="text-[10px] uppercase tracking-[0.2em] text-green-700 mt-1 inline-flex items-center gap-1">
                        <Sparkles className="h-3 w-3" /> Claimed{" "}
                        {item.claimed_at ? formatDate(item.claimed_at) : ""}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {pkg.is_pack && (
            <p className="mt-6 text-xs italic text-black/55">
              Each piece in a pack carries its own sub-code. At collection, you scan
              the sub-code printed on your collection ticket — only the rightful owner
              can claim it.
            </p>
          )}
        </section>

        {/* Footer */}
        <footer className="text-center py-6">
          <p className="text-xs uppercase tracking-[0.3em] text-black/40">
            <PackageIcon className="inline-block h-3.5 w-3.5 mr-1.5" />
            BLESSLUXE Atelier
          </p>
          <p className="mt-1 font-mono text-[11px] tracking-[0.2em] text-black/35">
            {pkg.package_code}
          </p>
        </footer>
      </div>
    </main>
  );
}

function Pill({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone: "active" | "success" | "gold" | "muted";
}) {
  const styles =
    tone === "success"
      ? { background: "#DCFCE7", color: "#15803D" }
      : tone === "gold"
      ? { background: "#FAF0D4", color: "#B8860B" }
      : tone === "active"
      ? { background: "#DBEAFE", color: "#1E40AF" }
      : { background: "#F3F4F6", color: "#4B5563" };
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-[0.2em]"
      style={styles}
    >
      {children}
    </span>
  );
}

function ShippingAddress({ address }: { address: Record<string, unknown> }) {
  const line = (k: string) => (address[k] ? String(address[k]) : "");
  const lines = [
    [line("first_name"), line("last_name")].filter(Boolean).join(" "),
    line("address_1") || line("line1"),
    line("address_2") || line("line2"),
    [line("city"), line("postal_code") || line("postcode")].filter(Boolean).join(" "),
    line("country") || line("country_code"),
  ].filter(Boolean);
  if (lines.length === 0) return <p className="text-black/40">—</p>;
  return (
    <div className="text-xs text-black/70 space-y-0.5">
      {lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
    </div>
  );
}
