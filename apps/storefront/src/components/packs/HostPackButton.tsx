"use client";

import { useState } from "react";
import Link from "next/link";
import { Users, Copy, Check } from "lucide-react";

interface HostPackButtonProps {
  packDefinitionId: string;
  packTitle: string;
  handle: string;
}

export function HostPackButton({ packDefinitionId, packTitle }: HostPackButtonProps) {
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onHost = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/pack-campaigns/host", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          pack_definition_id: packDefinitionId,
          title: `${packTitle} — group buy`,
        }),
      });
      const data = (await res.json()) as { public_code?: string; error?: string };
      if (!res.ok || !data.public_code) {
        setError(data.error || "Could not start the group buy.");
        return;
      }
      setCode(data.public_code);
      setShareUrl(`${window.location.origin}/packs/${data.public_code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  if (code && shareUrl) {
    return (
      <div className="border border-gold/40 bg-cream/40 p-5">
        <p className="font-display text-base text-gold-dark mb-2 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Your group buy is live
        </p>
        <p className="text-sm text-black/65 mb-3">
          Share this link. Each friend claims a slot — when it&apos;s full, the
          order processes for everyone together.
        </p>
        <div className="flex flex-wrap items-stretch gap-2">
          <input
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="flex-1 min-w-[240px] bg-white border border-black/10 px-3 py-2 text-sm font-mono"
          />
          <button
            onClick={onCopy}
            className="inline-flex items-center gap-1.5 bg-black text-white px-4 py-2 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy link"}
          </button>
        </div>
        <p className="text-xs text-black/50 mt-3">
          Public code: <span className="font-mono">{code}</span>. Manage it from your{" "}
          <Link href="/account?tab=packs" className="underline">account</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border border-black/10 bg-white p-5">
      <div className="flex-1 min-w-[260px]">
        <p className="font-display text-base text-black mb-1 flex items-center gap-2">
          <Users className="w-4 h-4 text-gold-dark" />
          Host a group buy
        </p>
        <p className="text-sm text-black/65">
          Invite friends to each claim a slot. The pack ships when it&apos;s full
          — and you earn Bits for every slot filled.
        </p>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
      </div>
      <button
        onClick={onHost}
        disabled={busy}
        className="inline-flex items-center gap-2 bg-gold text-white px-6 py-3 text-xs font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors disabled:opacity-60"
      >
        <Users className="w-3.5 h-3.5" />
        {busy ? "Starting…" : "Start a group buy"}
      </button>
    </div>
  );
}
