'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { usePathname } from 'next/navigation';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  title: string;
  message?: string;
  variant: ToastVariant;
  durationMs: number;
}

interface ToastInput {
  title: string;
  message?: string;
  variant?: ToastVariant;
  durationMs?: number;
}

interface ToastContextValue {
  showToast: (input: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-emerald-500/40 bg-emerald-50 text-emerald-900',
  error: 'border-red-500/40 bg-red-50 text-red-900',
  info: 'border-theme-primary/35 bg-theme-background text-theme-text',
};
const VARIANT_ACCENT: Record<ToastVariant, string> = {
  success: 'bg-emerald-500',
  error: 'bg-red-500',
  info: 'bg-theme-primary',
};

const VARIANT_ICON: Record<ToastVariant, ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeoutRef = useRef<Map<string, number>>(new Map());
  const timerMetaRef = useRef<Map<string, { remainingMs: number; startedAtMs: number }>>(new Map());

  const clearToastTimer = useCallback((id: string) => {
    const timeoutId = timeoutRef.current.get(id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      timeoutRef.current.delete(id);
    }
  }, []);

  const dismissToast = useCallback((id: string) => {
    clearToastTimer(id);
    timerMetaRef.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, [clearToastTimer]);

  const scheduleDismiss = useCallback(
    (id: string, delayMs: number) => {
      clearToastTimer(id);
      const normalizedDelay = Math.max(100, delayMs);
      timerMetaRef.current.set(id, {
        remainingMs: normalizedDelay,
        startedAtMs: Date.now(),
      });
      const timeoutId = window.setTimeout(() => {
        dismissToast(id);
      }, normalizedDelay);
      timeoutRef.current.set(id, timeoutId);
    },
    [clearToastTimer, dismissToast]
  );

  useEffect(() => {
    return () => {
      for (const timeoutId of timeoutRef.current.values()) {
        window.clearTimeout(timeoutId);
      }
      timeoutRef.current.clear();
      timerMetaRef.current.clear();
    };
  }, []);

  const showToast = useCallback(
    ({ title, message, variant = 'info', durationMs = 3200 }: ToastInput) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const normalizedDuration = Math.max(1400, durationMs);
      setToasts((current) => [...current, { id, title, message, variant, durationMs: normalizedDuration }]);
      scheduleDismiss(id, normalizedDuration);
    },
    [scheduleDismiss]
  );

  const value = useMemo(() => ({ showToast }), [showToast]);
  const toastPositionClass = useMemo(() => {
    if (pathname.startsWith('/checkout')) {
      return 'left-1/2 top-20 -translate-x-1/2';
    }
    if (pathname.startsWith('/affiliate/shop/')) {
      return 'bottom-6 left-1/2 -translate-x-1/2';
    }
    return 'right-4 top-20';
  }, [pathname]);

  return (
    <ToastContext.Provider value={value}>
      {children}

      <div className={`pointer-events-none fixed z-[120] flex w-[min(92vw,24rem)] flex-col gap-3 ${toastPositionClass}`}>
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const Icon = VARIANT_ICON[toast.variant];
            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, x: 42, scale: 0.96, filter: 'blur(4px)' }}
                animate={{ opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: 42, scale: 0.96, filter: 'blur(4px)' }}
                transition={{ type: 'spring', stiffness: 420, damping: 30, mass: 0.6 }}
                layout
                drag="x"
                dragDirectionLock
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={0.2}
                onDragEnd={(_, info) => {
                  const crossedDistance = Math.abs(info.offset.x) > 90;
                  const crossedVelocity = Math.abs(info.velocity.x) > 650;
                  if (crossedDistance || crossedVelocity) {
                    dismissToast(toast.id);
                  }
                }}
                onHoverStart={() => {
                  const meta = timerMetaRef.current.get(toast.id);
                  if (!meta) return;
                  const elapsed = Date.now() - meta.startedAtMs;
                  const remaining = Math.max(100, meta.remainingMs - elapsed);
                  timerMetaRef.current.set(toast.id, { remainingMs: remaining, startedAtMs: Date.now() });
                  clearToastTimer(toast.id);
                }}
                onHoverEnd={() => {
                  const meta = timerMetaRef.current.get(toast.id);
                  if (!meta) return;
                  scheduleDismiss(toast.id, meta.remainingMs);
                }}
                onTouchStart={() => {
                  const meta = timerMetaRef.current.get(toast.id);
                  if (!meta) return;
                  const elapsed = Date.now() - meta.startedAtMs;
                  const remaining = Math.max(100, meta.remainingMs - elapsed);
                  timerMetaRef.current.set(toast.id, { remainingMs: remaining, startedAtMs: Date.now() });
                  clearToastTimer(toast.id);
                }}
                onTouchEnd={() => {
                  const meta = timerMetaRef.current.get(toast.id);
                  if (!meta) return;
                  scheduleDismiss(toast.id, meta.remainingMs);
                }}
                className={`pointer-events-auto overflow-hidden rounded-xl border px-4 py-3 shadow-xl backdrop-blur-sm ${VARIANT_STYLES[toast.variant]}`}
                role="status"
                aria-live="polite"
              >
                <div className="flex items-start gap-3">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{toast.title}</p>
                    {toast.message ? <p className="mt-0.5 text-xs opacity-90">{toast.message}</p> : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => dismissToast(toast.id)}
                    className="rounded-md p-1 transition-colors hover:bg-black/10"
                    aria-label="Dismiss notification"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <motion.div
                  initial={{ width: '100%' }}
                  animate={{ width: 0 }}
                  transition={{ duration: toast.durationMs / 1000, ease: 'linear' }}
                  className={`mt-3 h-1 rounded-full ${VARIANT_ACCENT[toast.variant]}`}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}
