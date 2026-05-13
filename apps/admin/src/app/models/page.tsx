"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, ImageIcon, Sparkles, Upload, X } from "lucide-react";
import { api, mediaUrl } from "@/lib/api";
import { useAuthGate } from "@/lib/useAuthGate";
import { AdminShell } from "@/components/AdminShell";
import { useDialog } from "@/components/Dialog";
import type { ModelRow } from "@/lib/types";
import {
  PageHeader,
  Modal,
  Field,
  inputCls,
  btnPrimary,
  btnGhost,
  SectionTitle,
} from "@/components/Modal";

export default function ModelsPage() {
  const router = useRouter();
  const { user, loading } = useAuthGate();
  const dialog = useDialog();
  const [models, setModels] = useState<ModelRow[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refFile, setRefFile] = useState<File | null>(null);
  const [refPreview, setRefPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setRefFile(null);
    setRefPreview(null);
  };

  const onPickFile = (f: File | null) => {
    setRefFile(f);
    if (refPreview) URL.revokeObjectURL(refPreview);
    setRefPreview(f ? URL.createObjectURL(f) : null);
  };

  const load = async () => {
    const res = await api.get<{ models: ModelRow[] }>("/admin/models");
    setModels(res.models);
  };

  useEffect(() => {
    if (user) void load();
  }, [user]);

  const onCreate = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      name: String(fd.get("name") || "").trim(),
      description: String(fd.get("description") || "").trim() || undefined,
      gender: String(fd.get("gender") || "").trim() || undefined,
      age_range: String(fd.get("age_range") || "").trim() || undefined,
      ethnicity: String(fd.get("ethnicity") || "").trim() || undefined,
      prompt_template: String(fd.get("prompt_template") || "").trim() || undefined,
    };
    try {
      // 1. Create the model record
      const created = await api.post<{ model: ModelRow }>("/admin/models", body);
      const modelId = created.model.id;

      // 2. If a reference image was provided, upload it and attach as the first asset
      if (refFile) {
        const up = await api.upload<{ url: string }>("/admin/uploads", refFile);
        const mediaType = refFile.type.startsWith("video/")
          ? "video"
          : refFile.type === "image/gif"
            ? "gif"
            : "image";
        await api.post(`/admin/models/${modelId}/assets`, {
          media_url: up.url,
          media_type: mediaType,
          source_kind: "upload",
          caption: "Reference photo",
        });
      }

      setOpen(false);
      resetForm();
      // 3. Send the admin straight to the model detail page so they can
      //    keep adding angles or generate variants.
      router.push(`/models/${modelId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed";
      await dialog.alert({ title: "Create failed", message, tone: "danger" });
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

  return (
    <AdminShell user={user}>
      <PageHeader
        title="Models"
        subtitle="Create virtual avatars and use AI to generate angle shots, then style them with any product."
      />

      <div className="mb-6 flex justify-between items-center">
        <SectionTitle hint="Each model has a primary identity asset and any number of generated or uploaded variants (angles, lighting, video).">
          Cast
        </SectionTitle>
        <button onClick={() => setOpen(true)} className={btnPrimary}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          New model
        </button>
      </div>

      {models.length === 0 ? (
        <div className="py-16 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-[var(--gold-dark)] mb-3" />
          <p className="font-display text-2xl text-[var(--ink-muted)]">No models yet</p>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">
            Click <span className="font-semibold">New model</span> to start a virtual cast.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {models.map((m) => (
            <Link
              key={m.id}
              href={`/models/${m.id}`}
              className="group bg-white overflow-hidden transition-shadow hover:shadow-md"
              style={{ border: "1px solid var(--line)", borderRadius: 4 }}
            >
              <div className="aspect-[3/4] bg-[var(--cream-dark)] relative">
                {m.primary_media_url ? (
                  m.primary_media_type === "video" ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video
                      src={mediaUrl(m.primary_media_url)}
                      poster={mediaUrl(m.primary_thumbnail_url) || undefined}
                      muted
                      loop
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mediaUrl(m.primary_thumbnail_url || m.primary_media_url)}
                      alt={m.name}
                      className="w-full h-full object-cover"
                    />
                  )
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[var(--ink-muted)]">
                    <ImageIcon className="h-8 w-8" />
                  </div>
                )}
                {!m.is_active && (
                  <span className="absolute top-2 left-2 badge badge-mute">Hidden</span>
                )}
              </div>
              <div className="p-4">
                <p className="font-medium truncate">{m.name}</p>
                <p className="text-xs text-[var(--ink-muted)] mt-0.5 truncate">
                  {[m.gender, m.age_range, m.ethnicity].filter(Boolean).join(" · ") || "—"}
                </p>
                <p className="text-[10px] uppercase tracking-luxe text-[var(--gold-dark)] mt-2">
                  {m.asset_count} asset{m.asset_count === 1 ? "" : "s"}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => {
          setOpen(false);
          resetForm();
        }}
        title="New model"
        footer={
          <>
            <button
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
              className={btnGhost}
            >
              Cancel
            </button>
            <button form="new-model-form" type="submit" disabled={busy} className={btnPrimary}>
              {busy ? "Saving…" : "Create model"}
            </button>
          </>
        }
      >
        <form id="new-model-form" onSubmit={onCreate} className="space-y-4">
          <Field
            label="Reference photo"
            hint="Optional — but the AI uses this to lock the face when generating new angles. Skip to start with text only."
          >
            <div className="space-y-2">
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0] || null;
                  onPickFile(f);
                  e.currentTarget.value = "";
                }}
              />
              {refPreview ? (
                <div
                  className="relative w-full overflow-hidden rounded-sm bg-[var(--cream-dark)]"
                  style={{ border: "1px solid var(--line)" }}
                >
                  {refFile?.type.startsWith("video/") ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video src={refPreview} controls className="w-full max-h-64 object-contain" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={refPreview} alt="reference" className="w-full max-h-64 object-contain" />
                  )}
                  <button
                    type="button"
                    onClick={() => onPickFile(null)}
                    title="Remove"
                    aria-label="Remove reference"
                    className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-[var(--ink)] shadow hover:bg-white"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-sm py-6 text-sm text-[var(--ink-muted)] transition-colors hover:bg-[var(--cream-dark)] hover:text-[var(--gold-dark)]"
                  style={{ border: "1px dashed var(--line)" }}
                >
                  <Upload className="h-4 w-4" />
                  Upload reference photo
                </button>
              )}
            </div>
          </Field>

          <Field label="Name" required>
            <input name="name" required className={inputCls} placeholder="Amara" />
          </Field>
          <Field label="Description" hint="Short bio for your reference.">
            <textarea
              name="description"
              rows={3}
              className={inputCls}
              placeholder="Tall, elegant, Zimbabwean, sculpted short afro, warm tones."
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Gender">
              <select name="gender" className="select" defaultValue="">
                <option value="">—</option>
                <option value="woman">Woman</option>
                <option value="man">Man</option>
                <option value="nonbinary">Nonbinary</option>
                <option value="child">Child</option>
              </select>
            </Field>
            <Field label="Age range">
              <input name="age_range" className={inputCls} placeholder="20–30" />
            </Field>
            <Field label="Ethnicity">
              <input
                name="ethnicity"
                className={inputCls}
                placeholder="Black African"
              />
            </Field>
          </div>
          <Field
            label="AI identity prompt"
            hint="The base description Nano Banana uses when generating new angles. Detailed = consistent identity."
          >
            <textarea
              name="prompt_template"
              rows={4}
              className={inputCls}
              placeholder="A tall Black Zimbabwean woman in her late twenties with rich dark skin, sharp cheekbones, and a sculpted short afro. Warm copper highlights against deep brown skin."
            />
          </Field>
        </form>
      </Modal>
    </AdminShell>
  );
}
