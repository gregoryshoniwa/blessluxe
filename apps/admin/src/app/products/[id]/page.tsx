"use client";

import { useEffect, useState, FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Save, ImageIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthGate } from "@/lib/useAuthGate";
import type {
  Product,
  Catalogue,
  ProductOption,
  ProductTag,
  Variant,
  VariantPrice,
} from "@/lib/types";
import { AdminShell } from "@/components/AdminShell";
import { useDialog } from "@/components/Dialog";
import {
  Modal,
  Field,
  PageHeader,
  inputCls,
  btnPrimary,
  btnGhost,
  btnDanger,
  btnGold,
  SectionTitle,
} from "@/components/Modal";

type FullProduct = {
  product: Product;
  options: ProductOption[];
  variants: Variant[];
};

const DEFAULT_TAG_OPTIONS = ["new", "bestseller", "hot", "sale", "trending"];

const COMMON_CURRENCIES = [
  { code: "usd", label: "USD" },
  { code: "gbp", label: "GBP" },
  { code: "eur", label: "EUR" },
  { code: "zar", label: "ZAR" },
];

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading } = useAuthGate();
  const [data, setData] = useState<FullProduct | null>(null);
  const [catalogues, setCatalogues] = useState<Catalogue[]>([]);
  const [productCatalogueIds, setProductCatalogueIds] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<ProductTag[]>([]);
  const [productTags, setProductTags] = useState<string[]>([]);
  const [tab, setTab] = useState<"general" | "variants" | "options" | "tags">("general");
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const productId = params?.id;

  const load = async () => {
    if (!productId) return;
    const [full, cs, tagsRes, productCats, productTagsRes] = await Promise.all([
      api.get<FullProduct>(`/admin/products/${productId}/full`),
      api.get<{ catalogues: Catalogue[] }>("/admin/catalogues"),
      api.get<{ tags: ProductTag[] }>("/admin/tags"),
      api.get<{ catalogues: Catalogue[] }>(`/admin/products/${productId}/catalogues`),
      api.get<{ tags: ProductTag[] }>(`/admin/products/${productId}/tags`),
    ]);
    setData(full);
    setCatalogues(cs.catalogues);
    setAllTags(tagsRes.tags);
    setProductCatalogueIds(productCats.catalogues.map((c) => c.id));
    setProductTags(productTagsRes.tags.map((t) => t.value));
  };

  useEffect(() => {
    if (user && productId) void load();
  }, [user, productId]);

  if (loading || !user || !data) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="font-script text-2xl text-[var(--gold-dark)]">Bless</p>
      </div>
    );
  }

  const onSaveGeneral = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      title: String(fd.get("title") || "").trim(),
      handle: String(fd.get("handle") || "").trim() || undefined,
      subtitle: String(fd.get("subtitle") || "") || undefined,
      description: String(fd.get("description") || "") || undefined,
      thumbnail: String(fd.get("thumbnail") || "") || undefined,
      status: String(fd.get("status") || "published"),
    };
    try {
      await api.patch(`/admin/products/${data.product.id}`, body);
      await api.put(`/admin/products/${data.product.id}/catalogues`, {
        catalogue_ids: productCatalogueIds,
      });
      await load();
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1500);
    } finally {
      setSaving(false);
    }
  };

  const onUploadThumb = async (file: File) => {
    return (await api.upload<{ url: string }>("/admin/uploads", file)).url;
  };

  const groupedCatalogues = catalogues.reduce<Record<string, Catalogue[]>>((acc, c) => {
    const k = c.heading_name || c.heading_handle || "Other";
    if (!acc[k]) acc[k] = [];
    acc[k].push(c);
    return acc;
  }, {});

  return (
    <AdminShell user={user}>
      <div className="mb-6">
        <Link
          href="/products"
          className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)] transition-colors hover:text-[var(--gold-dark)]"
        >
          <ArrowLeft className="h-3 w-3" />
          All products
        </Link>
      </div>

      <PageHeader
        title={data.product.title}
        subtitle={`Handle · ${data.product.handle}`}
      />

      {/* Tabs */}
      <div
        className="mb-6 flex gap-1"
        style={{ borderBottom: "1px solid var(--line)" }}
      >
        {(["general", "variants", "options", "tags"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="relative px-4 py-2.5 text-[11px] font-semibold uppercase tracking-luxe transition-colors"
            style={{
              color: tab === t ? "var(--ink)" : "var(--ink-muted)",
            }}
          >
            {t}
            {tab === t && (
              <span
                className="absolute bottom-[-1px] left-0 right-0 h-[2px]"
                style={{ background: "var(--gold)" }}
              />
            )}
          </button>
        ))}
      </div>

      {/* General tab */}
      {tab === "general" && (
        <form onSubmit={onSaveGeneral} className="grid grid-cols-3 gap-8">
          <div className="col-span-2 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Title" required>
                <input name="title" required defaultValue={data.product.title} className={inputCls} />
              </Field>
              <Field label="Handle">
                <input name="handle" defaultValue={data.product.handle} className={inputCls} />
              </Field>
            </div>
            <Field label="Subtitle">
              <input name="subtitle" defaultValue={data.product.subtitle || ""} className={inputCls} />
            </Field>
            <Field label="Description">
              <textarea
                name="description"
                rows={5}
                defaultValue={data.product.description || ""}
                className="textarea"
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Status">
                <select name="status" defaultValue={data.product.status} className="select">
                  <option value="published">Published</option>
                  <option value="draft">Draft</option>
                </select>
              </Field>
            </div>
            <ThumbnailUpload defaultUrl={data.product.thumbnail || ""} onUpload={onUploadThumb} />
          </div>

          <div className="space-y-5">
            <div className="card p-5">
              <SectionTitle hint="Select all catalogues this product appears in.">Catalogues</SectionTitle>
              <div className="space-y-3">
                {Object.entries(groupedCatalogues).map(([heading, list]) => (
                  <div key={heading}>
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-luxe text-[var(--gold-dark)]">
                      {heading}
                    </p>
                    <div className="space-y-1 pl-1">
                      {list.map((c) => {
                        const checked = productCatalogueIds.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className="flex cursor-pointer items-center gap-2 rounded-sm py-0.5 text-sm text-[var(--ink-light)] hover:text-[var(--ink)]"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setProductCatalogueIds((prev) =>
                                  e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)
                                )
                              }
                              className="h-4 w-4 accent-[var(--gold-dark)]"
                            />
                            {c.name}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] font-medium text-[var(--gold-dark)] transition-opacity"
                   style={{ opacity: savedFlash ? 1 : 0 }}>
                ✓ Saved
              </div>
              <button type="submit" disabled={saving} className={btnPrimary}>
                <Save className="mr-1.5 h-3.5 w-3.5" />
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Tags tab */}
      {tab === "tags" && (
        <TagsEditor
          allTags={allTags}
          productTags={productTags}
          onChange={async (next) => {
            setProductTags(next);
            await api.put(`/admin/products/${data.product.id}/tags`, { values: next });
          }}
        />
      )}

      {/* Options tab */}
      {tab === "options" && (
        <OptionsEditor
          options={data.options}
          onSave={async (newOptions) => {
            await api.put(`/admin/products/${data.product.id}/options`, { options: newOptions });
            await load();
          }}
        />
      )}

      {/* Variants tab */}
      {tab === "variants" && (
        <VariantsTab
          productId={data.product.id}
          options={data.options}
          variants={data.variants}
          onChange={load}
        />
      )}
    </AdminShell>
  );
}

// ─── Tags editor ──────────────────────────────────────────────────────
function TagsEditor({
  allTags,
  productTags,
  onChange,
}: {
  allTags: ProductTag[];
  productTags: string[];
  onChange: (next: string[]) => void | Promise<void>;
}) {
  const [adding, setAdding] = useState("");
  const tags = new Set(productTags);

  const toggle = (v: string) => {
    const next = new Set(productTags);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    void onChange([...next]);
  };

  const all = Array.from(
    new Set([...DEFAULT_TAG_OPTIONS, ...allTags.map((t) => t.value)])
  ).sort();

  const onAdd = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const v = adding.trim().toLowerCase();
    if (!v) return;
    setAdding("");
    if (!tags.has(v)) {
      const next = [...productTags, v];
      void onChange(next);
    }
  };

  return (
    <div className="grid grid-cols-2 gap-8">
      <div className="card p-6">
        <SectionTitle hint="Toggle the storefront merchandising flags. Customers see these as badges on product cards.">
          Featured tags
        </SectionTitle>
        <div className="space-y-2">
          {all.map((v) => (
            <label
              key={v}
              className="flex cursor-pointer items-center justify-between rounded-sm px-3 py-2 transition-colors hover:bg-[var(--cream)]"
              style={{ border: "1px solid var(--line-soft)" }}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={tags.has(v)}
                  onChange={() => toggle(v)}
                  className="h-4 w-4 accent-[var(--gold-dark)]"
                />
                <span className="font-medium text-sm capitalize">{v}</span>
              </div>
              <BadgeForTag value={v} />
            </label>
          ))}
        </div>
        <form onSubmit={onAdd} className="mt-5 flex gap-2">
          <input
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            placeholder="Custom tag (e.g. 'limited-edition')"
            className={inputCls}
          />
          <button type="submit" className={btnGhost} disabled={!adding.trim()}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add
          </button>
        </form>
      </div>

      <div className="card p-6">
        <SectionTitle hint="Reference for how each tag surfaces on the storefront.">
          What each tag does
        </SectionTitle>
        <ul className="space-y-3 text-sm text-[var(--ink-light)]">
          <Tip badge="new" desc="Renders the “New Arrivals” badge and qualifies for the New Arrivals carousel." />
          <Tip badge="bestseller" desc="Promotes the product into the Bestsellers section." />
          <Tip badge="hot" desc="High-priority red badge — usually paired with limited stock." />
          <Tip badge="sale" desc="Sale badge. Pair with a campaign or sale_amount on variant prices." />
          <Tip badge="trending" desc="Promoted in trending shelves, lower priority than hot." />
        </ul>
      </div>
    </div>
  );
}

function Tip({ badge, desc }: { badge: string; desc: string }) {
  return (
    <li className="flex items-start gap-3">
      <BadgeForTag value={badge} />
      <p className="text-xs leading-relaxed">{desc}</p>
    </li>
  );
}

function BadgeForTag({ value }: { value: string }) {
  const map: Record<string, string> = {
    new: "badge badge-info",
    bestseller: "badge badge-gold",
    hot: "badge badge-danger",
    sale: "badge badge-danger",
    trending: "badge badge-warn",
  };
  return <span className={map[value] || "badge badge-mute"}>{value}</span>;
}

// ─── Options editor ────────────────────────────────────────────────────
function OptionsEditor({
  options,
  onSave,
}: {
  options: ProductOption[];
  onSave: (opts: Array<{ title: string; values: string[] }>) => Promise<void>;
}) {
  const [draft, setDraft] = useState<Array<{ title: string; values: string }>>(
    options.length > 0
      ? options.map((o) => ({ title: o.title, values: o.values.map((v) => v.value).join(", ") }))
      : [{ title: "Size", values: "XS, S, M, L, XL" }]
  );
  const [busy, setBusy] = useState(false);

  const update = (i: number, key: "title" | "values", val: string) => {
    setDraft((prev) => prev.map((d, idx) => (idx === i ? { ...d, [key]: val } : d)));
  };

  const remove = (i: number) =>
    setDraft((prev) => prev.filter((_, idx) => idx !== i));

  const add = () =>
    setDraft((prev) => [...prev, { title: "Color", values: "" }]);

  const save = async () => {
    setBusy(true);
    try {
      await onSave(
        draft.map((d) => ({
          title: d.title.trim(),
          values: d.values
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean),
        }))
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card p-6">
      <SectionTitle hint="Define the dimensions a customer chooses (e.g. Size, Color, Length). After saving, configure variants combining these in the Variants tab.">
        Product options
      </SectionTitle>
      <p
        className="mb-5 rounded-sm px-3 py-2 text-xs text-[var(--ink-muted)]"
        style={{ background: "var(--cream)", border: "1px solid var(--line-soft)" }}
      >
        ⚠️ Replacing options removes existing variants&apos; option assignments. Re-save the variants
        afterwards to re-bind them.
      </p>
      <div className="space-y-3">
        {draft.map((d, i) => (
          <div key={i} className="grid grid-cols-[1fr_2fr_auto] items-end gap-3">
            <Field label={`Option ${i + 1}`}>
              <input
                value={d.title}
                onChange={(e) => update(i, "title", e.target.value)}
                placeholder="Size"
                className={inputCls}
              />
            </Field>
            <Field label="Values" hint="Comma-separated">
              <input
                value={d.values}
                onChange={(e) => update(i, "values", e.target.value)}
                placeholder="XS, S, M, L"
                className={inputCls}
              />
            </Field>
            <button onClick={() => remove(i)} className={`${btnDanger}`} type="button">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-between">
        <button onClick={add} className={btnGhost} type="button">
          <Plus className="mr-1 h-3.5 w-3.5" /> Add option
        </button>
        <button onClick={save} disabled={busy} className={btnPrimary} type="button">
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {busy ? "Saving…" : "Save options"}
        </button>
      </div>
    </div>
  );
}

// ─── Variants tab ──────────────────────────────────────────────────────
function VariantsTab({
  productId,
  options,
  variants,
  onChange,
}: {
  productId: string;
  options: ProductOption[];
  variants: Variant[];
  onChange: () => Promise<void>;
}) {
  const dialog = useDialog();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Variant | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCreate = () => { setEditing(null); setError(null); setOpen(true); };
  const onEdit = (v: Variant) => { setEditing(v); setError(null); setOpen(true); };

  const onDelete = async (v: Variant) => {
    const ok = await dialog.confirm({
      title: `Delete variant "${v.title}"?`,
      message: v.sku ? `SKU ${v.sku} will be removed permanently.` : "This variant will be removed permanently.",
      tone: "danger",
      confirmLabel: "Delete variant",
    });
    if (!ok) return;
    await api.delete(`/admin/variants/${v.id}`);
    await onChange();
  };

  const onReceive = async (v: Variant) => {
    const qtyStr = await dialog.prompt({
      title: "Receive stock",
      message: `Adding inventory for ${v.title}${v.sku ? ` (SKU ${v.sku})` : ""}.`,
      inputLabel: "Units received",
      inputType: "number",
      placeholder: "e.g. 12",
      required: true,
      validate: (val) => {
        const n = Number(val);
        if (!Number.isFinite(n) || n <= 0) return "Enter a positive number.";
        return null;
      },
      confirmLabel: "Receive",
    });
    if (qtyStr == null) return;
    const qty = Number(qtyStr);
    if (!qty || qty <= 0) return;
    await api.post(`/admin/inventory/receive`, {
      variant_id: v.id,
      quantity: qty,
      reference: "manual",
      notes: "Manual receipt from admin variants tab",
    });
    await onChange();
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);

    const optionMap: Record<string, string> = {};
    for (const opt of options) {
      const v = String(fd.get(`opt_${opt.id}`) || "").trim();
      if (v) optionMap[opt.title] = v;
    }

    const prices: VariantPrice[] = [];
    for (const c of COMMON_CURRENCIES) {
      const amount = Number(fd.get(`price_${c.code}`));
      if (amount > 0) {
        const sale = Number(fd.get(`sale_${c.code}`));
        prices.push({
          currency_code: c.code,
          amount: Math.round(amount * 100),
          sale_amount: sale > 0 ? Math.round(sale * 100) : null,
          sale_starts_at: String(fd.get(`sale_start_${c.code}`) || "") || null,
          sale_ends_at: String(fd.get(`sale_end_${c.code}`) || "") || null,
        });
      }
    }

    const body = {
      title: String(fd.get("title") || "").trim(),
      sku: String(fd.get("sku") || "") || undefined,
      manage_inventory: fd.get("manage_inventory") === "on",
      inventory_quantity: Number(fd.get("inventory_quantity") || 0),
      allow_backorder: fd.get("allow_backorder") === "on",
      cost_price: Number(fd.get("cost_price")) > 0 ? Math.round(Number(fd.get("cost_price")) * 100) : undefined,
      weight_grams: Number(fd.get("weight_grams")) || undefined,
      options: optionMap,
      prices,
    };
    try {
      if (editing) {
        await api.put(`/admin/variants/${editing.id}/full`, body);
      } else {
        await api.post(`/admin/products/${productId}/variants-full`, body);
      }
      setOpen(false);
      await onChange();
    } catch (err: unknown) {
      setError((err as { message?: string }).message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <SectionTitle hint="Each variant maps to a row of the option grid. Set per-currency pricing, SKUs, and inventory.">
          Variants
        </SectionTitle>
        <button onClick={onCreate} className={btnPrimary} disabled={options.length === 0}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New variant
        </button>
      </div>

      {options.length === 0 && (
        <p
          className="mb-5 rounded-sm px-4 py-3 text-sm text-[var(--ink-muted)]"
          style={{ background: "var(--cream)", border: "1px solid var(--line-soft)" }}
        >
          Define product options first (Size, Color, etc.) in the Options tab.
        </p>
      )}

      <div
        className="overflow-hidden bg-white"
        style={{ border: "1px solid var(--line)", borderRadius: 4 }}
      >
        <table className="w-full text-sm">
          <thead style={{ background: "var(--cream)" }}>
            <tr className="text-left text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
              <th className="px-5 py-3">Variant</th>
              <th className="px-5 py-3">SKU</th>
              <th className="px-5 py-3">Options</th>
              <th className="px-5 py-3">Inventory</th>
              <th className="px-5 py-3">Pricing</th>
              <th className="px-5 py-3 text-right pr-5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr
                key={v.id}
                className="transition-colors hover:bg-[var(--cream)]"
                style={{ borderTop: "1px solid var(--line-soft)" }}
              >
                <td className="px-5 py-4 font-display text-base font-medium tracking-soft">{v.title}</td>
                <td className="px-5 py-4 font-mono text-xs text-[var(--ink-muted)]">{v.sku || "—"}</td>
                <td className="px-5 py-4">
                  <div className="flex flex-wrap gap-1.5">
                    {v.options && Object.entries(v.options).map(([k, val]) => (
                      <span
                        key={k}
                        className="rounded-sm px-2 py-0.5 text-[10px] uppercase tracking-luxe"
                        style={{
                          background: "var(--cream-dark)",
                          color: "var(--ink-light)",
                        }}
                      >
                        {k} <span style={{ color: "var(--gold-dark)" }}>{val}</span>
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span
                      className="font-display text-base"
                      style={{
                        color: v.inventory_quantity > 0 ? "var(--ink)" : "var(--ink-muted)",
                      }}
                    >
                      {v.inventory_quantity}
                    </span>
                    {v.inventory_quantity === 0 && <span className="badge badge-danger">Out</span>}
                    {v.inventory_quantity > 0 && v.inventory_quantity <= 3 && (
                      <span className="badge badge-warn">Low</span>
                    )}
                  </div>
                </td>
                <td className="px-5 py-4 text-xs">
                  {v.prices && v.prices.length > 0 ? (
                    <div className="space-y-0.5">
                      {v.prices.slice(0, 2).map((p, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="uppercase tracking-luxe text-[var(--ink-muted)]">
                            {p.currency_code}
                          </span>
                          {p.sale_amount && p.sale_amount < p.amount ? (
                            <>
                              <span className="line-through text-[var(--ink-muted)]">
                                {(p.amount / 100).toFixed(2)}
                              </span>
                              <span className="text-[var(--gold-dark)] font-medium">
                                {(p.sale_amount / 100).toFixed(2)}
                              </span>
                            </>
                          ) : (
                            <span className="font-medium">{(p.amount / 100).toFixed(2)}</span>
                          )}
                        </div>
                      ))}
                      {v.prices.length > 2 && (
                        <span className="text-[var(--ink-muted)]">+{v.prices.length - 2} more</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-[var(--ink-muted)]">—</span>
                  )}
                </td>
                <td className="px-5 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button onClick={() => onReceive(v)} className={`${btnGhost} btn-sm`}>Receive</button>
                    <button onClick={() => onEdit(v)} className={`${btnGhost} btn-sm`}>Edit</button>
                    <button onClick={() => onDelete(v)} className={btnDanger}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
            {variants.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center">
                  <p className="font-display text-xl text-[var(--ink-muted)]">No variants yet</p>
                  <p className="mt-1 text-xs text-[var(--ink-muted)]">
                    Add options first, then create variants.
                  </p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit variant · ${editing.title}` : "New variant"}
        subtitle="Options, SKU, inventory, and per-currency pricing."
        width="max-w-3xl"
        footer={
          <>
            <button onClick={() => setOpen(false)} className={btnGhost} type="button">Cancel</button>
            <button form="variant-form" type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "Saving…" : editing ? "Save changes" : "Create variant"}
            </button>
          </>
        }
      >
        <form id="variant-form" onSubmit={onSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Title" required>
              <input
                name="title"
                required
                defaultValue={editing?.title || ""}
                placeholder="e.g. Black / M"
                className={inputCls}
              />
            </Field>
            <Field label="SKU">
              <input
                name="sku"
                defaultValue={editing?.sku || ""}
                placeholder="ABC-001"
                className={inputCls}
              />
            </Field>
          </div>

          {options.length > 0 && (
            <div className="card p-4">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-luxe text-[var(--gold-dark)]">
                Option assignments
              </p>
              <div className="grid grid-cols-2 gap-4">
                {options.map((o) => (
                  <Field key={o.id} label={o.title}>
                    <select
                      name={`opt_${o.id}`}
                      defaultValue={editing?.options?.[o.title] || ""}
                      className="select"
                    >
                      <option value="">— none —</option>
                      {o.values.map((v) => (
                        <option key={v.id} value={v.value}>{v.value}</option>
                      ))}
                    </select>
                  </Field>
                ))}
              </div>
            </div>
          )}

          <div className="card p-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-luxe text-[var(--gold-dark)]">
              Inventory
            </p>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Quantity">
                <input
                  type="number"
                  name="inventory_quantity"
                  min={0}
                  defaultValue={editing?.inventory_quantity ?? 0}
                  className={inputCls}
                />
              </Field>
              <Field label="Cost / unit (major)" hint="For margin reporting">
                <input
                  type="number"
                  step="0.01"
                  name="cost_price"
                  defaultValue={
                    editing?.cost_price != null ? (editing.cost_price / 100).toFixed(2) : ""
                  }
                  className={inputCls}
                />
              </Field>
              <Field label="Weight (g)">
                <input
                  type="number"
                  name="weight_grams"
                  defaultValue={editing?.weight_grams ?? ""}
                  className={inputCls}
                />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap gap-5 text-sm text-[var(--ink-light)]">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  name="manage_inventory"
                  defaultChecked={editing ? editing.manage_inventory : true}
                  className="h-4 w-4 accent-[var(--gold-dark)]"
                />
                Track inventory
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  name="allow_backorder"
                  defaultChecked={editing?.allow_backorder ?? false}
                  className="h-4 w-4 accent-[var(--gold-dark)]"
                />
                Allow backorder
              </label>
            </div>
          </div>

          <div className="card p-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-luxe text-[var(--gold-dark)]">
              Pricing
            </p>
            <p className="mb-4 text-xs text-[var(--ink-muted)]">
              Enter prices in major units (e.g. 89.99). Set sale price + window to schedule a markdown.
            </p>
            <div className="space-y-3">
              {COMMON_CURRENCIES.map((c) => {
                const existing = editing?.prices?.find((p) => p.currency_code === c.code);
                const toMajor = (n: number | null | undefined) => (n ? (n / 100).toFixed(2) : "");
                const toLocalDt = (s?: string | null) => (s ? new Date(s).toISOString().slice(0, 16) : "");
                return (
                  <div key={c.code} className="grid grid-cols-[60px_1fr_1fr_1fr_1fr] items-end gap-3">
                    <span className="font-mono text-xs uppercase tracking-luxe text-[var(--gold-dark)]">
                      {c.label}
                    </span>
                    <Field label="Price">
                      <input
                        type="number"
                        step="0.01"
                        name={`price_${c.code}`}
                        defaultValue={toMajor(existing?.amount)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Sale price">
                      <input
                        type="number"
                        step="0.01"
                        name={`sale_${c.code}`}
                        defaultValue={toMajor(existing?.sale_amount)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Sale starts">
                      <input
                        type="datetime-local"
                        name={`sale_start_${c.code}`}
                        defaultValue={toLocalDt(existing?.sale_starts_at)}
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Sale ends">
                      <input
                        type="datetime-local"
                        name={`sale_end_${c.code}`}
                        defaultValue={toLocalDt(existing?.sale_ends_at)}
                        className={inputCls}
                      />
                    </Field>
                  </div>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </form>
      </Modal>
    </>
  );
}

function ThumbnailUpload({
  defaultUrl,
  onUpload,
}: {
  defaultUrl: string;
  onUpload: (file: File) => Promise<string>;
}) {
  const [url, setUrl] = useState(defaultUrl);
  const [uploading, setUploading] = useState(false);

  return (
    <Field label="Thumbnail">
      <div className="flex items-start gap-4">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            className="h-24 w-24 rounded-sm object-cover"
            style={{ border: "1px solid var(--line)" }}
          />
        ) : (
          <div
            className="flex h-24 w-24 items-center justify-center rounded-sm"
            style={{ background: "var(--cream-dark)", color: "var(--ink-muted)" }}
          >
            <ImageIcon className="h-5 w-5" />
          </div>
        )}
        <div className="flex-1 space-y-2">
          <input type="hidden" name="thumbnail" value={url} />
          <input
            type="text"
            placeholder="https://… or upload below"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            className={inputCls}
          />
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              try {
                setUrl(await onUpload(file));
              } finally {
                setUploading(false);
              }
            }}
            className="text-xs text-[var(--ink-muted)]"
          />
          {uploading && <p className="text-xs text-[var(--ink-muted)]">Uploading…</p>}
        </div>
      </div>
    </Field>
  );
}
