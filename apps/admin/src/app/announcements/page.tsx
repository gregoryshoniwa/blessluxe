"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { Plus, Edit3, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthGate } from "@/lib/useAuthGate";
import { AdminShell } from "@/components/AdminShell";
import { useDialog } from "@/components/Dialog";
import {
  PageHeader,
  Modal,
  Field,
  inputCls,
  btnPrimary,
  btnGhost,
  btnDanger,
  SectionTitle,
} from "@/components/Modal";

type Position = "hero" | "top_bar";
type MediaType = "image" | "video" | "gif";

interface Announcement {
  id: string;
  position: Position;
  media_type: MediaType;
  media_url: string;
  poster_url: string | null;
  heading: string | null;
  subheading: string | null;
  cta_label: string | null;
  cta_href: string | null;
  text_align: "left" | "center" | "right";
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
}

export default function AnnouncementsAdminPage() {
  const { user, loading } = useAuthGate();
  const dialog = useDialog();
  const [rows, setRows] = useState<Announcement[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [busy, setBusy] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaType, setMediaType] = useState<MediaType>("image");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    const res = await api.get<{ announcements: Announcement[] }>(
      "/admin/announcements"
    );
    setRows(res.announcements);
  };

  useEffect(() => {
    if (user) void load();
  }, [user]);

  const openCreate = () => {
    setEditing(null);
    setMediaUrl("");
    setMediaType("image");
    setOpen(true);
  };
  const openEdit = (a: Announcement) => {
    setEditing(a);
    setMediaUrl(a.media_url);
    setMediaType(a.media_type);
    setOpen(true);
  };

  const onUpload = async (file: File) => {
    setUploading(true);
    try {
      const res = await api.upload<{ url: string }>("/admin/uploads", file);
      setMediaUrl(res.url);
      // Best-effort detect media type from mime.
      if (file.type.startsWith("video/")) setMediaType("video");
      else if (file.type === "image/gif") setMediaType("gif");
      else setMediaType("image");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      await dialog.alert({ title: "Upload failed", message, tone: "danger" });
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!mediaUrl.trim()) {
      await dialog.alert({
        title: "Media required",
        message: "Upload or paste a media URL before saving.",
        tone: "warning",
      });
      return;
    }
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      position: String(fd.get("position") || "hero") as Position,
      media_type: mediaType,
      media_url: mediaUrl,
      poster_url: String(fd.get("poster_url") || "").trim() || null,
      heading: String(fd.get("heading") || "").trim() || null,
      subheading: String(fd.get("subheading") || "").trim() || null,
      cta_label: String(fd.get("cta_label") || "").trim() || null,
      cta_href: String(fd.get("cta_href") || "").trim() || null,
      text_align: String(fd.get("text_align") || "left"),
      sort_order: Number(fd.get("sort_order") || 0),
      is_active: fd.get("is_active") === "on",
      starts_at: String(fd.get("starts_at") || "") || null,
      ends_at: String(fd.get("ends_at") || "") || null,
    };
    try {
      if (editing) {
        await api.patch(`/admin/announcements/${editing.id}`, body);
      } else {
        await api.post("/admin/announcements", body);
      }
      setOpen(false);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      await dialog.alert({ title: "Save failed", message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (a: Announcement) => {
    const ok = await dialog.confirm({
      title: `Delete this slide?`,
      message: a.heading || a.media_url,
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/announcements/${a.id}`);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      await dialog.alert({ title: "Delete failed", message, tone: "danger" });
    }
  };

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="font-script text-2xl text-[var(--gold-dark)]">Bless</p>
      </div>
    );
  }

  const hero = rows.filter((r) => r.position === "hero");
  const topBar = rows.filter((r) => r.position === "top_bar");

  return (
    <AdminShell user={user}>
      <PageHeader
        title="Announcements"
        subtitle="Configure the homepage hero carousel and top-bar promotions. Supports image, GIF, and video."
      />

      <div className="mb-6 flex justify-between items-center">
        <SectionTitle hint="Hero slides render on the homepage carousel. Top-bar promos sit above the navigation.">
          Slides
        </SectionTitle>
        <button onClick={openCreate} className={btnPrimary}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New slide
        </button>
      </div>

      <div className="space-y-8">
        <SlideGroup title="Hero carousel" rows={hero} onEdit={openEdit} onDelete={onDelete} />
        <SlideGroup title="Top bar" rows={topBar} onEdit={openEdit} onDelete={onDelete} />
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit slide" : "New slide"}
        footer={
          <>
            <button onClick={() => setOpen(false)} className={btnGhost}>Cancel</button>
            <button form="ann-form" type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "Saving…" : "Save"}
            </button>
          </>
        }
      >
        <form id="ann-form" onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Position">
              <select
                name="position"
                defaultValue={editing?.position || "hero"}
                className="select"
              >
                <option value="hero">Hero carousel</option>
                <option value="top_bar">Top bar</option>
              </select>
            </Field>
            <Field label="Sort order">
              <input
                type="number"
                name="sort_order"
                defaultValue={editing?.sort_order ?? 0}
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Media" required hint="Upload an image, GIF, or video. Max 50MB.">
            <div className="space-y-2">
              {mediaUrl &&
                (mediaType === "video" ? (
                  <video
                    src={mediaUrl}
                    controls
                    className="w-full max-h-48 object-cover bg-black"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl} alt="preview" className="w-full max-h-48 object-cover" />
                ))}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={uploading}
                  className={btnGhost}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  {uploading ? "Uploading…" : mediaUrl ? "Replace" : "Upload"}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,video/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onUpload(f);
                    e.currentTarget.value = "";
                  }}
                />
                <input
                  type="url"
                  value={mediaUrl}
                  onChange={(e) => setMediaUrl(e.target.value)}
                  className={`${inputCls} flex-1`}
                  placeholder="…or paste a hosted URL"
                />
              </div>
              <div className="flex gap-3 text-xs">
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="media_type"
                    checked={mediaType === "image"}
                    onChange={() => setMediaType("image")}
                  />
                  Image
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="media_type"
                    checked={mediaType === "gif"}
                    onChange={() => setMediaType("gif")}
                  />
                  GIF
                </label>
                <label className="flex items-center gap-1.5">
                  <input
                    type="radio"
                    name="media_type"
                    checked={mediaType === "video"}
                    onChange={() => setMediaType("video")}
                  />
                  Video
                </label>
              </div>
            </div>
          </Field>

          {mediaType === "video" && (
            <Field label="Poster URL" hint="Frame shown while the video loads.">
              <input
                type="url"
                name="poster_url"
                defaultValue={editing?.poster_url || ""}
                className={inputCls}
              />
            </Field>
          )}

          <Field label="Heading">
            <input
              name="heading"
              defaultValue={editing?.heading || ""}
              className={inputCls}
              placeholder="Embrace Your Luxe"
            />
          </Field>
          <Field label="Subheading">
            <input
              name="subheading"
              defaultValue={editing?.subheading || ""}
              className={inputCls}
              placeholder="Discover the art of effortless elegance"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="CTA label">
              <input
                name="cta_label"
                defaultValue={editing?.cta_label || ""}
                className={inputCls}
                placeholder="Shop Collection"
              />
            </Field>
            <Field label="CTA link">
              <input
                name="cta_href"
                defaultValue={editing?.cta_href || ""}
                className={inputCls}
                placeholder="/shop"
              />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Text align">
              <select
                name="text_align"
                defaultValue={editing?.text_align || "left"}
                className="select"
              >
                <option value="left">Left</option>
                <option value="center">Center</option>
                <option value="right">Right</option>
              </select>
            </Field>
            <Field label="Starts at" hint="Optional schedule window.">
              <input
                type="datetime-local"
                name="starts_at"
                defaultValue={editing?.starts_at ? editing.starts_at.slice(0, 16) : ""}
                className={inputCls}
              />
            </Field>
            <Field label="Ends at">
              <input
                type="datetime-local"
                name="ends_at"
                defaultValue={editing?.ends_at ? editing.ends_at.slice(0, 16) : ""}
                className={inputCls}
              />
            </Field>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="is_active"
              defaultChecked={editing ? editing.is_active : true}
              className="h-4 w-4 accent-[var(--gold-dark)]"
            />
            Active
          </label>
        </form>
      </Modal>
    </AdminShell>
  );
}

function SlideGroup({
  title,
  rows,
  onEdit,
  onDelete,
}: {
  title: string;
  rows: Announcement[];
  onEdit: (a: Announcement) => void;
  onDelete: (a: Announcement) => void;
}) {
  return (
    <section>
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-luxe text-[var(--gold-dark)]">
        {title} · {rows.length}
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {rows
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((a) => (
            <article
              key={a.id}
              className="bg-white overflow-hidden"
              style={{ border: "1px solid var(--line)", borderRadius: 4 }}
            >
              <div className="aspect-video bg-[var(--cream-dark)] relative">
                {a.media_type === "video" ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video
                    src={a.media_url}
                    poster={a.poster_url || undefined}
                    muted
                    loop
                    className="w-full h-full object-cover"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={a.media_url}
                    alt={a.heading || ""}
                    className="w-full h-full object-cover"
                  />
                )}
                {!a.is_active && (
                  <span className="absolute top-2 left-2 badge badge-mute">Hidden</span>
                )}
              </div>
              <div className="p-4 space-y-1">
                <p className="font-medium truncate">{a.heading || "(no heading)"}</p>
                <p className="text-xs text-[var(--ink-muted)] truncate">
                  {a.subheading || "—"}
                </p>
                <p className="text-[10px] uppercase tracking-luxe text-[var(--gold-dark)]">
                  {a.media_type} · sort {a.sort_order}
                </p>
              </div>
              <div className="flex border-t border-[var(--line-soft)]">
                <button
                  onClick={() => onEdit(a)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs uppercase tracking-luxe text-[var(--ink-muted)] hover:bg-[var(--cream-dark)] hover:text-[var(--ink)]"
                >
                  <Edit3 className="h-3.5 w-3.5" /> Edit
                </button>
                <button
                  onClick={() => onDelete(a)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs uppercase tracking-luxe text-[var(--ink-muted)] hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
                  style={{ borderLeft: "1px solid var(--line-soft)" }}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              </div>
            </article>
          ))}
        {rows.length === 0 && (
          <div className="md:col-span-2 xl:col-span-3 py-10 text-center text-sm italic text-[var(--ink-muted)]">
            No slides yet.
          </div>
        )}
      </div>
    </section>
  );
}
