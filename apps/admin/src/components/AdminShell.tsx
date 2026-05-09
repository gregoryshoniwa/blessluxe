"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import type { AdminUser } from "@/lib/types";
import { setToken } from "@/lib/api";

export function AdminShell({ user, children }: { user: AdminUser; children: ReactNode }) {
  const router = useRouter();

  const onSignOut = () => {
    setToken(null);
    router.replace("/login");
  };

  const initials =
    [user.first_name?.[0], user.last_name?.[0]]
      .filter(Boolean)
      .join("")
      .toUpperCase() ||
    user.email[0]?.toUpperCase() ||
    "A";

  return (
    <div className="flex min-h-screen" style={{ background: "var(--cream)" }}>
      <Sidebar onSignOut={onSignOut} />

      <main className="flex-1 min-w-0">
        {/* Top bar */}
        <header
          className="sticky top-0 z-30 flex items-center justify-between bg-white/80 backdrop-blur px-8 py-4"
          style={{ borderBottom: "1px solid var(--line-soft)" }}
        >
          <div className="flex items-center gap-3">
            <span className="h-px w-8 bg-[var(--gold)]" />
            <p className="text-[10px] font-semibold uppercase tracking-luxe text-[var(--ink-muted)]">
              BLESSLUXE Admin
            </p>
          </div>

          <div className="flex items-center gap-4">
            <a
              href="http://localhost:3000"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] font-medium uppercase tracking-luxe text-[var(--ink-muted)] transition-colors hover:text-[var(--gold-dark)]"
            >
              View storefront ↗
            </a>
            <div
              className="flex items-center gap-2.5 pl-4"
              style={{ borderLeft: "1px solid var(--line-soft)" }}
            >
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ background: "var(--gold-dark)" }}
              >
                {initials}
              </div>
              <div className="hidden sm:block">
                <p className="text-xs font-medium text-[var(--ink)]">
                  {user.first_name || user.email.split("@")[0]}
                </p>
                <p className="text-[10px] uppercase tracking-luxe text-[var(--ink-muted)]">
                  {user.role}
                </p>
              </div>
            </div>
          </div>
        </header>

        <div className="px-8 py-10 animate-fade-up max-w-[1400px]">{children}</div>
      </main>
    </div>
  );
}
