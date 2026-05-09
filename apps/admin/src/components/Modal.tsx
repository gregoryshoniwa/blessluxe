"use client";

import { ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = "max-w-lg",
}: ModalProps) {
  // Lazily resolve the portal target on the client. Using a state + effect
  // guards against SSR (no document) and against the rare timing window where
  // document.body isn't yet a valid element during hydration.
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof document !== "undefined" && document.body) {
      setContainer(document.body);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Lock body scroll while open
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open || !container) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-in"
      style={{ backgroundColor: "rgba(26, 26, 26, 0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className={`w-full ${width} max-h-[90vh] overflow-y-auto bg-white shadow-2xl animate-scale-in`}
        style={{ borderRadius: 6, border: "1px solid var(--line)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 pt-7 pb-5" style={{ borderBottom: "1px solid var(--line-soft)" }}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-medium tracking-soft text-[var(--ink)]">
                {title}
              </h2>
              {subtitle && (
                <p className="mt-1 text-xs text-[var(--ink-muted)]">{subtitle}</p>
              )}
              <span className="accent-bar" />
            </div>
            <button
              onClick={onClose}
              className="text-2xl leading-none text-[var(--ink-muted)] transition-colors hover:text-[var(--ink)]"
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
        <div className="px-8 py-6 space-y-5">{children}</div>
        {footer && (
          <div
            className="flex justify-end gap-2 px-8 py-4"
            style={{ borderTop: "1px solid var(--line-soft)", background: "var(--cream)" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    container
  );
}

export function Field({
  label,
  children,
  hint,
  required,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-luxe text-[var(--ink-light)]">
        {label}
        {required && <span className="ml-1 text-[var(--gold-dark)]">*</span>}
      </span>
      {children}
      {hint && (
        <span className="mt-1.5 block text-xs text-[var(--ink-muted)]">{hint}</span>
      )}
    </label>
  );
}

export const inputCls = "input";
export const btnPrimary = "btn-primary";
export const btnGhost = "btn-ghost";
export const btnDanger = "btn-danger btn-sm";
export const btnGold = "btn-gold";

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-6 pb-6 mb-8" style={{ borderBottom: "1px solid var(--line-soft)" }}>
      <div>
        <h1 className="font-display text-4xl font-medium tracking-soft text-[var(--ink)]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 text-sm text-[var(--ink-muted)] max-w-xl">{subtitle}</p>
        )}
        <span className="accent-bar" />
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({
  children,
  hover = false,
  className = "",
}: {
  children: ReactNode;
  hover?: boolean;
  className?: string;
}) {
  return (
    <div className={`card ${hover ? "card-hover" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-4">
      <p className="text-[11px] font-semibold uppercase tracking-luxe text-[var(--gold-dark)]">
        {children}
      </p>
      {hint && <p className="mt-1 text-xs text-[var(--ink-muted)]">{hint}</p>}
    </div>
  );
}
