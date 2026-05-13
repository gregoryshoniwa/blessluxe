"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Upload,
  Sparkles,
  Video,
  Star,
  Trash2,
  RefreshCcw,
} from "lucide-react";
import { api, mediaUrl } from "@/lib/api";
import { useAuthGate } from "@/lib/useAuthGate";
import { useDialog } from "@/components/Dialog";
import type { ModelDetail, ModelAsset } from "@/lib/types";
import { AdminShell } from "@/components/AdminShell";
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

export default function ModelDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id || "";
  const { user, loading } = useAuthGate();
  const dialog = useDialog();
  const fileRef = useRef<HTMLInputElement>(null);
  const [model, setModel] = useState<ModelDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [genOpen, setGenOpen] = useState(false);
  const [vidOpen, setVidOpen] = useState(false);

  const load = async () => {
    if (!id) return;
    const res = await api.get<{ model: ModelDetail }>(`/admin/models/${id}`);
    setModel(res.model);
  };

  useEffect(() => {
    if (user && id) void load();
  }, [user, id]);

  // Auto-poll pending video assets every 6s
  useEffect(() => {
    if (!model) return;
    const pending = model.assets.filter((a) => a.status === "pending" && a.operation_name);
    if (pending.length === 0) return;
    const t = setInterval(() => void load(), 6000);
    return () => clearInterval(t);
  }, [model]);

  const onUpload = async (file: File) => {
    setBusy(true);
    try {
      const up = await api.upload<{ url: string }>("/admin/uploads", file);
      const mediaType = file.type.startsWith("video/")
        ? "video"
        : file.type === "image/gif"
          ? "gif"
          : "image";
      await api.post(`/admin/models/${id}/assets`, {
        media_url: up.url,
        media_type: mediaType,
        source_kind: "upload",
      });
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      await dialog.alert({ title: "Upload failed", message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const onGenImage = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      pose: String(fd.get("pose") || "").trim() || undefined,
      angle: String(fd.get("angle") || "").trim() || undefined,
      lighting: String(fd.get("lighting") || "").trim() || undefined,
      backdrop: String(fd.get("backdrop") || "").trim() || undefined,
      prompt: String(fd.get("prompt") || "").trim() || undefined,
      use_existing_as_reference: true,
    };
    try {
      await api.post(`/admin/models/${id}/assets/generate-image`, body);
      setGenOpen(false);
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      await dialog.alert({ title: "Generation failed", message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const onGenVideo = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const body = {
      prompt: String(fd.get("prompt") || "").trim() || undefined,
      duration_seconds: Number(fd.get("duration_seconds") || 8),
      aspect_ratio: String(fd.get("aspect_ratio") || "16:9") as "16:9" | "9:16" | "1:1",
      reference_asset_id: String(fd.get("reference_asset_id") || "") || undefined,
    };
    try {
      await api.post(`/admin/models/${id}/assets/generate-video`, body);
      setVidOpen(false);
      await load();
      await dialog.alert({
        title: "Video generation started",
        message:
          "Veo 3 can take 1–3 minutes. The asset card will switch from 'Pending' to 'Ready' automatically.",
        tone: "info",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      await dialog.alert({ title: "Generation failed", message, tone: "danger" });
    } finally {
      setBusy(false);
    }
  };

  const onMakePrimary = async (asset: ModelAsset) => {
    await api.post(`/admin/models/${id}/assets/${asset.id}/primary`, {});
    await load();
  };

  const onDeleteAsset = async (asset: ModelAsset) => {
    const ok = await dialog.confirm({
      title: "Delete asset?",
      message: asset.caption || asset.prompt || "This asset will be removed.",
      tone: "danger",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    await api.delete(`/admin/models/${id}/assets/${asset.id}`);
    await load();
  };

  const onPoll = async (asset: ModelAsset) => {
    try {
      await api.post(`/admin/models/${id}/assets/${asset.id}/poll`, {});
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Poll failed";
      await dialog.alert({ title: "Poll failed", message, tone: "danger" });
    }
  };

  if (loading || !user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <p className="font-script text-2xl text-[var(--gold-dark)]">Bless</p>
      </div>
    );
  }
  if (!model) {
    return (
      <AdminShell user={user}>
        <div className="py-16 text-center text-[var(--ink-muted)]">Loading…</div>
      </AdminShell>
    );
  }

  const imageAssets = model.assets.filter((a) => a.media_type === "image" && a.status === "ready");

  return (
    <AdminShell user={user}>
      <Link
        href="/models"
        className="inline-flex items-center gap-1.5 text-xs uppercase tracking-luxe text-[var(--ink-muted)] hover:text-[var(--ink)] mb-4"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All models
      </Link>

      <PageHeader title={model.name} subtitle={model.description || undefined} />

      <div className="mb-6 flex flex-wrap gap-2">
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
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className={btnGhost}
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          Upload
        </button>
        <button onClick={() => setGenOpen(true)} disabled={busy} className={btnPrimary}>
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          Generate image
        </button>
        <button onClick={() => setVidOpen(true)} disabled={busy} className={btnPrimary}>
          <Video className="mr-1.5 h-3.5 w-3.5" />
          Generate video
        </button>
      </div>

      <SectionTitle hint="Star one asset to set it as the model's profile cover.">
        Assets · {model.assets.length}
      </SectionTitle>

      {model.assets.length === 0 ? (
        <div className="py-12 text-center text-sm italic text-[var(--ink-muted)]">
          No assets yet — upload a reference photo or generate one with AI.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {model.assets.map((a) => (
            <article
              key={a.id}
              className="group bg-white overflow-hidden"
              style={{ border: "1px solid var(--line)", borderRadius: 4 }}
            >
              <div className="aspect-[3/4] bg-[var(--cream-dark)] relative">
                {a.status === "ready" ? (
                  a.media_type === "video" ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video
                      src={mediaUrl(a.media_url)}
                      controls
                      poster={mediaUrl(a.thumbnail_url) || undefined}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={mediaUrl(a.thumbnail_url || a.media_url)}
                      alt={a.caption || ""}
                      className="w-full h-full object-cover"
                    />
                  )
                ) : a.status === "pending" ? (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-[var(--ink-muted)]">
                    <RefreshCcw className="h-6 w-6 animate-spin" />
                    <p className="text-xs uppercase tracking-luxe">Pending…</p>
                    <button
                      onClick={() => onPoll(a)}
                      className="text-[10px] underline"
                    >
                      Poll now
                    </button>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#B91C1C] p-3 text-center">
                    <p className="text-xs">{a.status_message || "Generation failed"}</p>
                  </div>
                )}
                {model.primary_asset_id === a.id && (
                  <span className="absolute top-2 left-2 badge badge-success">Primary</span>
                )}
                {a.source_kind !== "upload" && (
                  <span className="absolute top-2 right-2 badge badge-info">AI</span>
                )}
              </div>
              <div className="p-3">
                <p className="text-xs text-[var(--ink)] truncate">
                  {a.caption || (a.source_kind === "upload" ? "Uploaded reference" : "Generated")}
                </p>
                <div className="mt-2 flex gap-1">
                  {model.primary_asset_id !== a.id && a.status === "ready" && (
                    <button
                      onClick={() => onMakePrimary(a)}
                      title="Set as primary"
                      aria-label="Set primary"
                      className="flex h-7 w-7 items-center justify-center rounded-sm text-[var(--ink-muted)] hover:bg-[var(--cream-dark)] hover:text-[var(--gold-dark)]"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => onDeleteAsset(a)}
                    title="Delete"
                    aria-label="Delete"
                    className="flex h-7 w-7 items-center justify-center rounded-sm text-[var(--ink-muted)] hover:bg-[#FEE2E2] hover:text-[#B91C1C]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* ─── Generate image modal ─── */}
      <Modal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="Generate a new angle with Nano Banana"
        footer={
          <>
            <button onClick={() => setGenOpen(false)} className={btnGhost}>Cancel</button>
            <button form="gen-img-form" type="submit" disabled={busy} className={btnPrimary}>
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {busy ? "Generating…" : "Generate"}
            </button>
          </>
        }
      >
        <form id="gen-img-form" onSubmit={onGenImage} className="space-y-4">
          <p className="text-xs text-[var(--ink-muted)]">
            Existing image assets are passed as identity references so facial features stay
            consistent across angles.
          </p>
          <Field label="Pose">
            <input name="pose" className={inputCls} placeholder="confident full-body stance, hand on hip" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Camera angle">
              <input name="angle" className={inputCls} placeholder="three-quarter, eye level" />
            </Field>
            <Field label="Lighting">
              <input name="lighting" className={inputCls} placeholder="warm golden hour, soft side light" />
            </Field>
          </div>
          <Field label="Backdrop / scene">
            <input
              name="backdrop"
              className={inputCls}
              placeholder="sunlit Cape Town terrace overlooking the Atlantic"
            />
          </Field>
          <Field label="Extra direction (optional)">
            <textarea
              name="prompt"
              rows={3}
              className={inputCls}
              placeholder="Add anything else specific to this shot…"
            />
          </Field>
        </form>
      </Modal>

      {/* ─── Generate video modal ─── */}
      <Modal
        open={vidOpen}
        onClose={() => setVidOpen(false)}
        title="Generate a short video with Veo 3"
        footer={
          <>
            <button onClick={() => setVidOpen(false)} className={btnGhost}>Cancel</button>
            <button form="gen-vid-form" type="submit" disabled={busy} className={btnPrimary}>
              <Video className="mr-1.5 h-3.5 w-3.5" />
              {busy ? "Starting…" : "Start generation"}
            </button>
          </>
        }
      >
        <form id="gen-vid-form" onSubmit={onGenVideo} className="space-y-4">
          <p className="text-xs text-[var(--ink-muted)]">
            Veo 3 typically takes 60–120 seconds. The clip will appear here once it&apos;s ready.
          </p>
          <Field label="Direction" hint="Camera motion + mood">
            <textarea
              name="prompt"
              rows={4}
              className={inputCls}
              placeholder="6-second slow dolly: model walks toward camera in slow motion, glances over her shoulder at the final beat. Warm cinematic grade, gentle dust particles in the light."
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Duration (s)">
              <input
                type="number"
                name="duration_seconds"
                defaultValue={8}
                min={4}
                max={8}
                className={inputCls}
              />
            </Field>
            <Field label="Aspect">
              <select name="aspect_ratio" className="select" defaultValue="16:9">
                <option value="16:9">16:9 — hero</option>
                <option value="9:16">9:16 — reels</option>
                <option value="1:1">1:1 — square</option>
              </select>
            </Field>
          </div>
          <Field
            label="Identity reference"
            hint="Locks the face. Leave on (use primary) for the model's main shot."
          >
            <select
              name="reference_asset_id"
              className="select w-full"
              defaultValue=""
            >
              <option value="">(use primary)</option>
              {imageAssets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.caption || a.id.slice(-6)}
                </option>
              ))}
            </select>
          </Field>
        </form>
      </Modal>
    </AdminShell>
  );
}
