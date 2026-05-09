"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

interface PackageQRProps {
  /** Tracking code or full URL to encode. */
  value: string;
  /** Display size in CSS pixels (square). Default 180. */
  size?: number;
  /** Optional caption rendered under the QR. */
  caption?: string;
}

/**
 * Renders a QR code for the given tracking value as inline SVG. Falls back
 * gracefully if the QR library can't render (logs to console, shows the raw
 * value in a monospace box).
 */
export function PackageQR({ value, size = 180, caption }: PackageQRProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const svg = await QRCode.toString(value, {
          type: "svg",
          margin: 1,
          color: { dark: "#1A1A1A", light: "#FFFFFF" },
          width: size,
          errorCorrectionLevel: "M",
        });
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = svg;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not render QR");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div className="inline-flex flex-col items-center">
      <div
        ref={ref}
        className="bg-white p-3 border border-black/10 rounded"
        style={{ width: size + 24, height: size + 24 }}
        aria-label={`QR code for ${value}`}
      />
      {caption && (
        <p className="mt-2 font-mono text-[11px] tracking-[0.2em] text-black/70">{caption}</p>
      )}
      {error && (
        <p className="mt-1 font-mono text-[10px] text-red-600">{error}</p>
      )}
    </div>
  );
}
