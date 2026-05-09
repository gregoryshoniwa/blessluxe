"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Info,
  X,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────

export type DialogTone = "default" | "danger" | "success" | "info" | "warning";

interface BaseRequest {
  title?: string;
  message?: ReactNode;
  tone?: DialogTone;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ConfirmRequest extends BaseRequest {
  kind: "confirm";
}

interface PromptRequest extends BaseRequest {
  kind: "prompt";
  defaultValue?: string;
  placeholder?: string;
  inputLabel?: string;
  inputType?: "text" | "number" | "email" | "password";
  required?: boolean;
  multiline?: boolean;
  validate?: (value: string) => string | null;
}

interface AlertRequest extends BaseRequest {
  kind: "alert";
}

type Request = ConfirmRequest | PromptRequest | AlertRequest;

interface ActiveDialog {
  request: Request;
  resolve: (value: unknown) => void;
}

interface DialogApi {
  confirm: (req: Omit<ConfirmRequest, "kind">) => Promise<boolean>;
  prompt: (req: Omit<PromptRequest, "kind">) => Promise<string | null>;
  alert: (req: Omit<AlertRequest, "kind">) => Promise<void>;
}

const DialogCtx = createContext<DialogApi | null>(null);

// ─── Hook ────────────────────────────────────────────────────────────────

export function useDialog(): DialogApi {
  const ctx = useContext(DialogCtx);
  if (!ctx) {
    throw new Error("useDialog must be used inside <DialogProvider>");
  }
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────

export function DialogProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveDialog | null>(null);

  const enqueue = useCallback(<T,>(request: Request) => {
    return new Promise<T>((resolve) => {
      setActive({ request, resolve: resolve as (value: unknown) => void });
    });
  }, []);

  const api = useMemo<DialogApi>(
    () => ({
      confirm: (req) => enqueue<boolean>({ ...req, kind: "confirm" }),
      prompt: (req) => enqueue<string | null>({ ...req, kind: "prompt" }),
      alert: (req) => enqueue<void>({ ...req, kind: "alert" }),
    }),
    [enqueue]
  );

  const close = useCallback((value: unknown) => {
    setActive((curr) => {
      curr?.resolve(value);
      return null;
    });
  }, []);

  return (
    <DialogCtx.Provider value={api}>
      {children}
      {active && <DialogShell active={active} close={close} />}
    </DialogCtx.Provider>
  );
}

// ─── Tone styling ────────────────────────────────────────────────────────

const TONE_STYLES: Record<
  DialogTone,
  { iconColor: string; ring: string; confirmBg: string; confirmHover: string }
> = {
  default: {
    iconColor: "var(--gold-dark)",
    ring: "color-mix(in srgb, var(--gold) 22%, transparent)",
    confirmBg: "var(--ink)",
    confirmHover: "var(--gold-dark)",
  },
  danger: {
    iconColor: "#B91C1C",
    ring: "color-mix(in srgb, #DC2626 22%, transparent)",
    confirmBg: "#B91C1C",
    confirmHover: "#991B1B",
  },
  success: {
    iconColor: "#15803D",
    ring: "color-mix(in srgb, #16A34A 22%, transparent)",
    confirmBg: "#15803D",
    confirmHover: "#166534",
  },
  info: {
    iconColor: "#1D4ED8",
    ring: "color-mix(in srgb, #2563EB 22%, transparent)",
    confirmBg: "var(--ink)",
    confirmHover: "var(--gold-dark)",
  },
  warning: {
    iconColor: "#B45309",
    ring: "color-mix(in srgb, #D97706 22%, transparent)",
    confirmBg: "var(--ink)",
    confirmHover: "var(--gold-dark)",
  },
};

function ToneIcon({ tone }: { tone: DialogTone }) {
  const cls = "h-5 w-5";
  if (tone === "danger") return <AlertTriangle className={cls} />;
  if (tone === "success") return <CheckCircle2 className={cls} />;
  if (tone === "warning") return <AlertCircle className={cls} />;
  if (tone === "info") return <Info className={cls} />;
  return <HelpCircle className={cls} />;
}

// ─── Shell ────────────────────────────────────────────────────────────────

function DialogShell({
  active,
  close,
}: {
  active: ActiveDialog;
  close: (value: unknown) => void;
}) {
  const { request } = active;
  const tone: DialogTone = request.tone || (request.kind === "confirm" ? "warning" : "default");
  const styles = TONE_STYLES[tone];

  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const [value, setValue] = useState<string>(
    request.kind === "prompt" ? request.defaultValue ?? "" : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (typeof document !== "undefined" && document.body) {
      setContainer(document.body);
    }
  }, []);

  // Autofocus
  useEffect(() => {
    if (request.kind === "prompt") {
      // Slight delay so the animation doesn't steal focus visually.
      const t = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select?.();
      }, 30);
      return () => clearTimeout(t);
    }
    cancelRef.current?.focus();
  }, [request.kind]);

  // Esc to dismiss + body scroll lock
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelOut();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cancelOut = () => {
    if (request.kind === "alert") return close(undefined);
    if (request.kind === "confirm") return close(false);
    return close(null); // prompt
  };

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (request.kind === "alert") return close(undefined);
    if (request.kind === "confirm") return close(true);
    // prompt
    if (request.required && !value.trim()) {
      setError("This field is required.");
      return;
    }
    if (request.validate) {
      const v = request.validate(value);
      if (v) {
        setError(v);
        return;
      }
    }
    return close(value);
  };

  const confirmLabel =
    request.confirmLabel ||
    (request.kind === "alert" ? "OK" : request.kind === "prompt" ? "Save" : "Confirm");
  const cancelLabel = request.cancelLabel || "Cancel";

  if (!container) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bl-dialog-title"
      className="fixed inset-0 z-[120] flex items-center justify-center px-4 animate-fade-in"
      style={{ background: "rgba(26, 26, 26, 0.55)", backdropFilter: "blur(4px)" }}
      onClick={cancelOut}
    >
      <div
        className="relative w-full max-w-md bg-white shadow-2xl animate-scale-in"
        style={{
          border: "1px solid var(--line)",
          borderRadius: 6,
          boxShadow: `0 24px 60px -20px ${styles.ring}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={cancelOut}
          aria-label="Close"
          className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full text-[var(--ink-muted)] transition-colors hover:bg-[var(--cream)] hover:text-[var(--ink)]"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <form onSubmit={submit}>
          <div className="px-7 pt-7 pb-5">
            <div className="flex items-start gap-4">
              <div
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
                style={{
                  background: `color-mix(in srgb, ${styles.iconColor} 14%, white)`,
                  color: styles.iconColor,
                }}
              >
                <ToneIcon tone={tone} />
              </div>
              <div className="flex-1 min-w-0">
                {request.title && (
                  <h2
                    id="bl-dialog-title"
                    className="font-display text-2xl font-medium tracking-soft text-[var(--ink)]"
                  >
                    {request.title}
                  </h2>
                )}
                {request.message && (
                  <div className="mt-1.5 text-sm leading-relaxed text-[var(--ink-light)]">
                    {request.message}
                  </div>
                )}
                <span
                  className="mt-3 block h-px w-12"
                  style={{ background: styles.iconColor, opacity: 0.7 }}
                />
              </div>
            </div>

            {request.kind === "prompt" && (
              <div className="mt-5">
                {request.inputLabel && (
                  <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
                    {request.inputLabel}
                  </label>
                )}
                {request.multiline ? (
                  <textarea
                    ref={(el) => {
                      inputRef.current = el;
                    }}
                    value={value}
                    onChange={(e) => {
                      setValue(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder={request.placeholder}
                    rows={3}
                    className="textarea"
                  />
                ) : (
                  <input
                    ref={(el) => {
                      inputRef.current = el;
                    }}
                    type={request.inputType || "text"}
                    value={value}
                    onChange={(e) => {
                      setValue(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder={request.placeholder}
                    className="input"
                    required={request.required}
                  />
                )}
                {error && (
                  <p className="mt-2 text-xs text-red-700">{error}</p>
                )}
              </div>
            )}
          </div>

          <div
            className="flex justify-end gap-2 px-7 py-4"
            style={{ borderTop: "1px solid var(--line-soft)", background: "var(--cream)" }}
          >
            {request.kind !== "alert" && (
              <button
                type="button"
                ref={cancelRef}
                onClick={cancelOut}
                className="btn-ghost"
              >
                {cancelLabel}
              </button>
            )}
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-sm border px-5 py-2 text-xs font-semibold uppercase tracking-luxe text-white transition-colors"
              style={{
                background: styles.confirmBg,
                borderColor: styles.confirmBg,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = styles.confirmHover;
                (e.currentTarget as HTMLButtonElement).style.borderColor = styles.confirmHover;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = styles.confirmBg;
                (e.currentTarget as HTMLButtonElement).style.borderColor = styles.confirmBg;
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>,
    container
  );
}
