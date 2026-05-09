"use client";

import { useEffect, useMemo, useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, ImageIcon, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthGate } from "@/lib/useAuthGate";
import type { Product, Catalogue, Heading } from "@/lib/types";
import { AdminShell } from "@/components/AdminShell";
import { useDialog } from "@/components/Dialog";
import { Pagination } from "@/components/Pagination";
import {
  Modal,
  Field,
  PageHeader,
  inputCls,
  btnPrimary,
  btnGhost,
  btnDanger,
} from "@/components/Modal";

interface CatalogueFilter {
  scope: "all" | "uncategorised" | "heading" | "catalogue";
  headingId?: string;
  catalogueId?: string;
}

export default function ProductsPage() {
  const router = useRouter();
  const { user, loading } = useAuthGate();
  const dialog = useDialog();
  const [products, setProducts] = useState<Product[]>([]);
  const [count, setCount] = useState(0);
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [catalogues, setCatalogues] = useState<Catalogue[]>([]);
  const [filter, setFilter] = useState<CatalogueFilter>({ scope: "all" });
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Reset to page 1 when filter or search changes
  useEffect(() => {
    setPage(1);
  }, [filter, search]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      limit: String(pageSize),
      offset: String((page - 1) * pageSize),
    });
    if (search) params.set("q", search);
    if (filter.scope === "catalogue" && filter.catalogueId) {
      params.set("catalogue_id", filter.catalogueId);
    } else if (filter.scope === "heading" && filter.headingId) {
      params.set("heading_id", filter.headingId);
    } else if (filter.scope === "uncategorised") {
      params.set("no_catalogue", "true");
    }
    return params.toString();
  }, [filter, search, page, pageSize]);

  const loadProducts = async () => {
    const p = await api.get<{ products: Product[]; count: number }>(
      `/admin/products?${queryString}`
    );
    setProducts(p.products);
    setCount(p.count);
  };

  const loadFilterOptions = async () => {
    const [h, c] = await Promise.all([
      api.get<{ headings: Heading[] }>("/admin/headings"),
      api.get<{ catalogues: Catalogue[] }>("/admin/catalogues"),
    ]);
    setHeadings(h.headings);
    setCatalogues(c.catalogues);
  };

  useEffect(() => {
    if (user) void loadFilterOptions();
  }, [user]);

  useEffect(() => {
    if (user) void loadProducts();
  }, [user, queryString]);

  const onDelete = async (p: Product) => {
    const ok = await dialog.confirm({
      title: `Delete "${p.title}"?`,
      message: "All variants, prices, images, and tag assignments for this product will be removed.",
      tone: "danger",
      confirmLabel: "Delete product",
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/products/${p.id}`);
      await loadProducts();
      await dialog.alert({
        title: "Product deleted",
        message: `"${p.title}" has been removed.`,
        tone: "success",
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "The product could not be deleted.";
      await dialog.alert({
        title: "Delete failed",
        message,
        tone: "danger",
      });
    }
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const body = {
      title: String(fd.get("title") || "").trim(),
      handle: String(fd.get("handle") || "").trim() || undefined,
      subtitle: String(fd.get("subtitle") || "") || undefined,
      description: String(fd.get("description") || "") || undefined,
      status: String(fd.get("status") || "published"),
    };
    try {
      const res = await api.post<{ product: Product }>("/admin/products", body);
      setOpen(false);
      router.push(`/products/${res.product.id}`);
    } catch (err: unknown) {
      setError((err as { message?: string }).message || "Failed");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="font-script text-2xl text-[var(--gold-dark)]">Bless</p>
      </div>
    );
  }

  // Group catalogues under their heading for the sidebar tree.
  const cataloguesByHeading = catalogues.reduce<Record<string, Catalogue[]>>((acc, c) => {
    const k = c.heading_id || "_orphan";
    (acc[k] ||= []).push(c);
    return acc;
  }, {});

  const filterLabel =
    filter.scope === "all"
      ? "All products"
      : filter.scope === "uncategorised"
        ? "Uncategorised"
        : filter.scope === "heading"
          ? headings.find((h) => h.id === filter.headingId)?.name || "Heading"
          : catalogues.find((c) => c.id === filter.catalogueId)?.name || "Catalogue";

  return (
    <AdminShell user={user}>
      <PageHeader
        title="Products"
        subtitle="Manage products, variants, catalogues, and merchandising tags."
        actions={
          <button onClick={() => { setError(null); setOpen(true); }} className={btnPrimary}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New product
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
        {/* ─── Catalogue filter sidebar ───────────────────── */}
        <aside
          className="bg-white p-4 lg:sticky lg:top-24 lg:self-start"
          style={{ border: "1px solid var(--line)", borderRadius: 4 }}
        >
          <p className="px-2 mb-3 text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
            Filter by catalogue
          </p>

          <ul className="space-y-0.5">
            <FilterRow
              active={filter.scope === "all"}
              onClick={() => setFilter({ scope: "all" })}
              label="All products"
              count={undefined}
            />
            <FilterRow
              active={filter.scope === "uncategorised"}
              onClick={() => setFilter({ scope: "uncategorised" })}
              label="Uncategorised"
              hint
            />
          </ul>

          <div className="mt-4">
            {headings
              .slice()
              .sort((a, b) => a.rank - b.rank)
              .map((h) => {
                const list = (cataloguesByHeading[h.id] || []).sort(
                  (a, b) => a.rank - b.rank
                );
                return (
                  <div key={h.id} className="mb-3">
                    <button
                      onClick={() =>
                        setFilter({ scope: "heading", headingId: h.id })
                      }
                      className="flex w-full items-center justify-between rounded-sm px-2 py-1 text-left transition-colors hover:bg-[var(--cream)]"
                      style={{
                        background:
                          filter.scope === "heading" && filter.headingId === h.id
                            ? "var(--cream-dark)"
                            : "transparent",
                      }}
                    >
                      <span
                        className="font-display text-sm font-medium tracking-soft"
                        style={{
                          color:
                            filter.scope === "heading" && filter.headingId === h.id
                              ? "var(--gold-dark)"
                              : "var(--ink)",
                        }}
                      >
                        {h.name}
                      </span>
                      <span className="text-[10px] text-[var(--ink-muted)]">
                        {h.catalogue_count ?? list.length}
                      </span>
                    </button>
                    <ul className="mt-0.5 space-y-0.5">
                      {list.map((c) => (
                        <FilterRow
                          key={c.id}
                          active={
                            filter.scope === "catalogue" && filter.catalogueId === c.id
                          }
                          onClick={() =>
                            setFilter({ scope: "catalogue", catalogueId: c.id })
                          }
                          label={c.name}
                          count={c.product_count ?? 0}
                          indent
                        />
                      ))}
                    </ul>
                  </div>
                );
              })}
          </div>
        </aside>

        {/* ─── Main column: search + table ─────────────────── */}
        <div>
          <div
            className="mb-4 flex items-center justify-between gap-3 bg-white px-4 py-3"
            style={{ border: "1px solid var(--line)", borderRadius: 4 }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-luxe"
                style={{
                  background: "var(--cream-dark)",
                  color: "var(--gold-dark)",
                }}
              >
                {filterLabel}
              </span>
              <span className="text-xs text-[var(--ink-muted)]">
                <span className="font-display text-base text-[var(--ink)]">{count}</span>{" "}
                {count === 1 ? "product" : "products"}
              </span>
              {filter.scope !== "all" && (
                <button
                  onClick={() => setFilter({ scope: "all" })}
                  className="inline-flex items-center gap-1 text-[10px] uppercase tracking-luxe text-[var(--ink-muted)] hover:text-[var(--gold-dark)]"
                >
                  <X className="h-3 w-3" />
                  clear
                </button>
              )}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(searchInput.trim());
              }}
              className="relative flex-shrink-0"
            >
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-muted)]" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search title or handle…"
                className="input w-64 text-xs"
                style={{ padding: "0.4rem 0.625rem 0.4rem 1.875rem" }}
              />
            </form>
          </div>

          <div
            className="overflow-hidden bg-white"
            style={{ border: "1px solid var(--line)", borderRadius: 4 }}
          >
            <table className="w-full text-sm">
              <thead style={{ background: "var(--cream)" }}>
                <tr className="text-left text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
                  <th className="px-5 py-3 w-16"></th>
                  <th className="px-5 py-3">Title</th>
                  <th className="px-5 py-3">Handle</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right pr-5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr
                    key={p.id}
                    className="cursor-pointer transition-colors hover:bg-[var(--cream)]"
                    style={{ borderTop: "1px solid var(--line-soft)" }}
                    onClick={() => router.push(`/products/${p.id}`)}
                  >
                    <td className="px-5 py-3">
                      {p.thumbnail ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.thumbnail}
                          alt=""
                          className="h-12 w-12 object-cover rounded-sm"
                          style={{ border: "1px solid var(--line-soft)" }}
                        />
                      ) : (
                        <div
                          className="flex h-12 w-12 items-center justify-center rounded-sm"
                          style={{ background: "var(--cream-dark)", color: "var(--ink-muted)" }}
                        >
                          <ImageIcon className="h-4 w-4" />
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <p className="font-display text-base font-medium tracking-soft">{p.title}</p>
                      {p.subtitle && (
                        <p className="mt-0.5 text-xs italic text-[var(--ink-muted)]">{p.subtitle}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-[var(--ink-muted)]">
                      {p.handle}
                    </td>
                    <td className="px-5 py-3">
                      <span className={p.status === "published" ? "badge badge-success" : "badge badge-mute"}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => router.push(`/products/${p.id}`)} className={`${btnGhost} btn-sm`}>
                          Open
                        </button>
                        <button onClick={() => onDelete(p)} className={btnDanger}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-16 text-center">
                      <p className="font-display text-2xl text-[var(--ink-muted)]">
                        {search || filter.scope !== "all"
                          ? "No matches"
                          : "No products yet"}
                      </p>
                      {(search || filter.scope !== "all") && (
                        <button
                          onClick={() => {
                            setFilter({ scope: "all" });
                            setSearch("");
                            setSearchInput("");
                          }}
                          className="mt-3 text-xs uppercase tracking-luxe text-[var(--gold-dark)] hover:underline"
                        >
                          Clear filters
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {count > 0 && (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={count}
                onPageChange={setPage}
                onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
                itemNoun="products"
              />
            )}
          </div>
        </div>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New product"
        subtitle="Save the basics — you'll add variants, options, tags, and catalogues on the next screen."
        footer={
          <>
            <button onClick={() => setOpen(false)} className={btnGhost} type="button">Cancel</button>
            <button form="product-create" type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "Creating…" : "Create & open"}
            </button>
          </>
        }
      >
        <form id="product-create" onSubmit={onSubmit} className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Title" required>
              <input name="title" required className={inputCls} />
            </Field>
            <Field label="Handle" hint="Auto-generated if blank">
              <input name="handle" className={inputCls} />
            </Field>
          </div>
          <Field label="Subtitle">
            <input name="subtitle" className={inputCls} />
          </Field>
          <Field label="Description">
            <textarea name="description" rows={3} className="textarea" />
          </Field>
          <Field label="Status">
            <select name="status" defaultValue="published" className="select">
              <option value="published">Published</option>
              <option value="draft">Draft</option>
            </select>
          </Field>
          {error && (
            <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          )}
        </form>
      </Modal>
    </AdminShell>
  );
}

function FilterRow({
  label,
  count,
  active,
  onClick,
  indent,
  hint,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  indent?: boolean;
  hint?: boolean;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className="relative flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-[var(--cream)]"
        style={{
          paddingLeft: indent ? "1.5rem" : undefined,
          background: active ? "var(--cream-dark)" : "transparent",
          color: active ? "var(--gold-dark)" : hint ? "var(--ink-muted)" : "var(--ink-light)",
          fontWeight: active ? 600 : 400,
        }}
      >
        {active && (
          <span
            className="absolute left-0 top-1.5 bottom-1.5 w-[2px]"
            style={{ background: "var(--gold)" }}
          />
        )}
        <span className="truncate">{label}</span>
        {count != null && (
          <span className="ml-2 text-[10px] text-[var(--ink-muted)]">{count}</span>
        )}
      </button>
    </li>
  );
}
