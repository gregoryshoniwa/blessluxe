"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Truck,
  MapPin,
  Search,
  ScanLine,
  Save,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuthGate } from "@/lib/useAuthGate";
import { useDialog } from "@/components/Dialog";
import type { PackageDetail } from "@/lib/types";
import { AdminShell } from "@/components/AdminShell";
import {
  PageHeader,
  Field,
  Modal,
  inputCls,
  btnPrimary,
  btnGhost,
  btnGold,
  SectionTitle,
} from "@/components/Modal";

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

const TERMINAL = new Set(["delivered", "returned", "cancelled"]);

const fmt = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

export default function PackageDetailPage() {
  const params = useParams<{ code: string }>();
  const { user, loading } = useAuthGate();
  const dialog = useDialog();
  const [pkg, setPkg] = useState<PackageDetail | null>(null);
  const [savingDetails, setSavingDetails] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const load = async () => {
    if (!params?.code) return;
    const r = await api.get<{ package: PackageDetail }>(
      `/admin/packages/${encodeURIComponent(params.code)}`
    );
    setPkg(r.package);
  };

  useEffect(() => {
    if (user) void load();
  }, [user, params?.code]);

  if (loading || !user || !pkg) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="font-script text-2xl text-[var(--gold-dark)]">Bless</p>
      </div>
    );
  }

  const flowIndex = STATUS_FLOW.findIndex((s) => s.key === pkg.status);
  const eventByStatus = pkg.events.reduce<Record<string, (typeof pkg.events)[number]>>(
    (acc, e) => (acc[e.status] ? acc : { ...acc, [e.status]: e }),
    {}
  );

  const onSaveDetails = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSavingDetails(true);
    const fd = new FormData(e.currentTarget);
    try {
      await api.patch(`/admin/packages/${pkg.id}`, {
        carrier: String(fd.get("carrier") || "") || null,
        carrier_tracking_number: String(fd.get("carrier_tracking_number") || "") || null,
        current_location: String(fd.get("current_location") || "") || null,
        estimated_delivery_at: String(fd.get("estimated_delivery_at") || "") || null,
        notes: String(fd.get("notes") || "") || null,
      });
      await load();
    } finally {
      setSavingDetails(false);
    }
  };

  const onAddEvent = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const status = String(fd.get("status") || "");
    const location = String(fd.get("location") || "");
    const notes = String(fd.get("notes") || "");
    if (!status) return;
    await api.post(`/admin/packages/${pkg.id}/events`, { status, location, notes });
    setEventOpen(false);
    await load();
  };

  const onClaimItem = async (itemId: string, subCode: string | null) => {
    const ok = await dialog.confirm({
      title: subCode ? `Mark ${subCode} as claimed?` : "Mark item as claimed?",
      message:
        "Use this when the customer is at the collection point. The system records who claimed and when.",
      tone: "warning",
      confirmLabel: "Confirm claim",
    });
    if (!ok) return;
    await api.post(`/admin/packages/items/${itemId}/claim`);
    await load();
  };

  return (
    <AdminShell user={user}>
      <div className="mb-6">
        <Link
          href="/packages"
          className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)] transition-colors hover:text-[var(--gold-dark)]"
        >
          <ArrowLeft className="h-3 w-3" />
          All packages
        </Link>
      </div>

      <PageHeader
        title={pkg.package_code}
        subtitle={`${pkg.is_pack ? "Pack collection · " : ""}Order ${pkg.order_number} · created ${fmt(pkg.created_at)}`}
        actions={
          <div className="flex gap-2">
            <button onClick={() => setScanOpen(true)} className={btnGhost}>
              <ScanLine className="mr-1.5 h-3.5 w-3.5" /> Verify sub-code
            </button>
            <button onClick={() => setEventOpen(true)} className={btnPrimary}>
              <Save className="mr-1.5 h-3.5 w-3.5" /> Add status event
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6">
          {/* Status timeline */}
          <div className="card p-6">
            <div className="flex items-baseline justify-between mb-5">
              <SectionTitle hint="Each step is a logged event with timestamp and operator.">
                Journey
              </SectionTitle>
              {pkg.current_location && (
                <p className="text-xs text-[var(--ink-muted)] inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {pkg.current_location}
                </p>
              )}
            </div>
            <ol className="space-y-3">
              {STATUS_FLOW.map((step, i) => {
                const reached = flowIndex >= i;
                const event = eventByStatus[step.key];
                const current = flowIndex === i && !TERMINAL.has(pkg.status);
                return (
                  <li key={step.key} className="flex items-start gap-4">
                    <span
                      className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
                      style={{
                        background: reached ? "var(--gold)" : "var(--cream-dark)",
                        color: reached ? "white" : "var(--ink-muted)",
                      }}
                    >
                      {reached ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm ${
                          current ? "text-[var(--gold-dark)] font-medium" : reached ? "text-[var(--ink)] font-medium" : "text-[var(--ink-muted)]"
                        }`}
                      >
                        {step.label}
                      </p>
                      {event && (
                        <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                          {fmt(event.created_at)}
                          {event.location ? ` · ${event.location}` : ""}
                          {event.notes ? ` · ${event.notes}` : ""}
                          {event.created_by_email ? ` · by ${event.created_by_email}` : ""}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {/* Items */}
          <div className="card p-6">
            <SectionTitle hint={pkg.is_pack ? "Pack items each carry a sub-code that only the slot-owning customer can claim." : "Order line items in this shipment."}>
              {pkg.is_pack ? "Pack contents" : "Items"}
            </SectionTitle>
            <table className="w-full text-sm">
              <thead style={{ background: "var(--cream)" }}>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2">SKU</th>
                  {pkg.is_pack && <th className="px-3 py-2">Sub-code</th>}
                  {pkg.is_pack && <th className="px-3 py-2">Slot owner</th>}
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {pkg.items.map((item) => (
                  <tr key={item.id} style={{ borderTop: "1px solid var(--line-soft)" }}>
                    <td className="px-3 py-3">
                      <p className="font-medium">{item.product_title}</p>
                      {item.variant_title && (
                        <p className="text-xs text-[var(--ink-muted)]">{item.variant_title}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-[var(--ink-muted)]">
                      {item.sku || "—"}
                    </td>
                    {pkg.is_pack && (
                      <td className="px-3 py-3 font-mono text-xs text-[var(--gold-dark)]">
                        {item.sub_code || "—"}
                      </td>
                    )}
                    {pkg.is_pack && (
                      <td className="px-3 py-3 text-xs">
                        {item.slot_customer_email || (
                          <span className="text-[var(--ink-muted)]">unclaimed slot</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-3">
                      <span
                        className={
                          item.status === "claimed"
                            ? "badge badge-success"
                            : item.status === "ready_for_collection"
                            ? "badge badge-gold"
                            : item.status === "packed"
                            ? "badge badge-info"
                            : "badge badge-mute"
                        }
                      >
                        {item.status}
                      </span>
                      {item.claimed_at && (
                        <p className="mt-1 text-[10px] text-[var(--ink-muted)]">{fmt(item.claimed_at)}</p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {item.status !== "claimed" && pkg.is_pack && (
                        <button
                          onClick={() => onClaimItem(item.id, item.sub_code)}
                          className={`${btnGhost} btn-sm`}
                        >
                          Mark claimed
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Carrier / address details */}
          <form onSubmit={onSaveDetails} className="card p-6">
            <SectionTitle hint="Update what the customer sees on their tracking page.">
              Carrier & shipping details
            </SectionTitle>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Carrier">
                <select name="carrier" defaultValue={pkg.carrier || ""} className="select">
                  <option value="">— Manual / In-house —</option>
                  <option value="ups">UPS</option>
                  <option value="fedex">FedEx</option>
                  <option value="dhl">DHL</option>
                  <option value="usps">USPS</option>
                  <option value="royal_mail">Royal Mail</option>
                  <option value="manual">Manual</option>
                </select>
              </Field>
              <Field label="Carrier tracking number">
                <input
                  name="carrier_tracking_number"
                  defaultValue={pkg.carrier_tracking_number || ""}
                  className={inputCls}
                  placeholder="e.g. 1Z999AA10123456784"
                />
              </Field>
              <Field label="Current location">
                <input
                  name="current_location"
                  defaultValue={pkg.current_location || ""}
                  className={inputCls}
                  placeholder="e.g. Memphis sorting facility"
                />
              </Field>
              <Field label="Estimated delivery">
                <input
                  type="datetime-local"
                  name="estimated_delivery_at"
                  defaultValue={pkg.estimated_delivery_at?.slice(0, 16) || ""}
                  className={inputCls}
                />
              </Field>
            </div>
            <div className="mt-4">
              <Field label="Internal notes">
                <textarea name="notes" rows={2} defaultValue={pkg.notes || ""} className="textarea" />
              </Field>
            </div>
            <div className="mt-4 flex justify-end">
              <button type="submit" disabled={savingDetails} className={btnPrimary}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {savingDetails ? "Saving…" : "Save details"}
              </button>
            </div>
          </form>
        </div>

        {/* Sidebar */}
        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="card p-5">
            <SectionTitle>Status</SectionTitle>
            <span
              className={
                pkg.status === "delivered"
                  ? "badge badge-success"
                  : pkg.status === "shipped" || pkg.status === "in_transit"
                  ? "badge badge-gold"
                  : pkg.status === "cancelled" || pkg.status === "returned"
                  ? "badge badge-danger"
                  : "badge badge-info"
              }
            >
              {pkg.status.replace(/_/g, " ")}
            </span>
            <button
              onClick={() => setEventOpen(true)}
              className={`${btnGold} mt-3 w-full`}
            >
              <Truck className="mr-1.5 h-3.5 w-3.5" /> Advance status
            </button>
          </div>

          <div className="card p-5">
            <SectionTitle>Customer</SectionTitle>
            {pkg.customer_email ? (
              <>
                <p className="font-medium">
                  {[pkg.cust_first, pkg.cust_last].filter(Boolean).join(" ") || pkg.customer_email}
                </p>
                <p className="text-sm text-[var(--ink-light)]">{pkg.customer_email}</p>
                {pkg.cust_phone && (
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">{pkg.cust_phone}</p>
                )}
                {pkg.loyalty_tier && (
                  <span className="mt-2 inline-block badge badge-gold">{pkg.loyalty_tier}</span>
                )}
              </>
            ) : (
              <p className="text-sm italic text-[var(--ink-muted)]">Guest checkout</p>
            )}
          </div>

          <div className="card p-5">
            <SectionTitle>Order</SectionTitle>
            <p className="font-mono text-sm">{pkg.order_number}</p>
            <p className="mt-1 font-display text-2xl">
              {new Intl.NumberFormat(undefined, {
                style: "currency",
                currency: pkg.currency_code.toUpperCase(),
                maximumFractionDigits: 2,
              }).format(pkg.total / 100)}
            </p>
          </div>

          {pkg.shipping_address && (
            <div className="card p-5">
              <SectionTitle>Shipping to</SectionTitle>
              <pre className="text-xs whitespace-pre-wrap text-[var(--ink-light)]" style={{ fontFamily: "inherit" }}>
                {Object.entries(pkg.shipping_address)
                  .filter(([, v]) => Boolean(v))
                  .map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v)}`)
                  .join("\n")}
              </pre>
            </div>
          )}
        </aside>
      </div>

      {/* Add event modal */}
      <Modal
        open={eventOpen}
        onClose={() => setEventOpen(false)}
        title="Add status event"
        subtitle="Logs to the timeline and updates the customer's tracking page."
        footer={
          <>
            <button onClick={() => setEventOpen(false)} className={btnGhost} type="button">Cancel</button>
            <button form="evt-form" type="submit" className={btnPrimary}>
              <Save className="mr-1.5 h-3.5 w-3.5" />
              Save event
            </button>
          </>
        }
      >
        <form id="evt-form" onSubmit={onAddEvent} className="space-y-4">
          <Field label="New status" required>
            <select name="status" required defaultValue={pkg.status} className="select">
              {STATUS_FLOW.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              <option value="returned">Returned</option>
              <option value="cancelled">Cancelled</option>
              <option value="lost">Lost</option>
            </select>
          </Field>
          <Field label="Location">
            <input name="location" placeholder="e.g. Heathrow customs" className={inputCls} />
          </Field>
          <Field label="Notes">
            <textarea name="notes" rows={2} placeholder="Optional event detail" className="textarea" />
          </Field>
        </form>
      </Modal>

      {/* Sub-code scan modal */}
      <SubcodeVerifier open={scanOpen} onClose={() => setScanOpen(false)} />
    </AdminShell>
  );
}

function SubcodeVerifier({ open, onClose }: { open: boolean; onClose: () => void }) {
  const dialog = useDialog();
  const [code, setCode] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onLookup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const r = await api.get<{ item: Record<string, unknown> }>(
        `/admin/packages/lookup/sub/${encodeURIComponent(code.trim().toUpperCase())}`
      );
      setResult(r.item);
    } catch (err) {
      const msg = (err as { message?: string }).message || "Sub-code not found.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  const onClaim = async () => {
    if (!result || result.status === "claimed") return;
    const ok = await dialog.confirm({
      title: "Confirm collection",
      message: (
        <>
          Hand over <span className="font-medium">{String(result.product_title || "")}</span> to{" "}
          <span className="font-medium">{String(result.email || "the customer")}</span>?
        </>
      ),
      tone: "warning",
      confirmLabel: "Mark claimed",
    });
    if (!ok) return;
    await api.post(`/admin/packages/items/${String(result.id)}/claim`);
    setResult({ ...result, status: "claimed", claimed_at: new Date().toISOString() });
  };

  return (
    <Modal
      open={open}
      onClose={() => { setCode(""); setResult(null); setError(null); onClose(); }}
      title="Verify pack sub-code"
      subtitle="Type or scan the sub-code printed on the customer's collection ticket."
      footer={
        <button onClick={() => { setCode(""); setResult(null); setError(null); onClose(); }} className={btnGhost} type="button">
          Close
        </button>
      }
    >
      <form onSubmit={onLookup} className="flex gap-2">
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="BL-XXXX-XXXX-X-NN"
          className={`${inputCls} font-mono`}
        />
        <button type="submit" disabled={busy || !code.trim()} className={btnPrimary}>
          <Search className="mr-1.5 h-3.5 w-3.5" /> Look up
        </button>
      </form>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-sm border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result && (
        <div className="mt-5 space-y-3">
          <div className="card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">Item</p>
            <p className="font-display text-lg">{String(result.product_title || "")}</p>
            <p className="text-xs text-[var(--ink-light)]">{String(result.variant_title || "")}</p>
            <p className="mt-1 font-mono text-[10px] text-[var(--ink-muted)]">
              {String(result.sku || "")} · pkg {String(result.package_code || "")}
            </p>
          </div>
          <div className="card p-4">
            <p className="text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">Slot owner</p>
            <p className="font-medium">
              {[result.first_name, result.last_name].filter(Boolean).join(" ") || "—"}
            </p>
            <p className="text-xs text-[var(--ink-light)]">{String(result.email || "—")}</p>
            {result.phone ? <p className="text-xs text-[var(--ink-muted)] mt-1">{String(result.phone)}</p> : null}
            {result.loyalty_tier ? (
              <span className="mt-2 inline-block badge badge-gold">{String(result.loyalty_tier)}</span>
            ) : null}
          </div>
          <div className="flex items-center justify-between">
            <span
              className={
                result.status === "claimed"
                  ? "badge badge-success"
                  : "badge badge-warn"
              }
            >
              {String(result.status)}
            </span>
            {result.status !== "claimed" && (
              <button onClick={onClaim} className={btnGold}>
                Confirm collection
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
