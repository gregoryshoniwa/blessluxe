"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, getToken, setToken } from "./api";
import type { AdminUser } from "./types";

export function useAuthGate() {
  const router = useRouter();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      router.replace("/login");
      return;
    }
    (async () => {
      try {
        const me = await api.get<{ user: AdminUser }>("/auth/me");
        setUser(me.user);
      } catch {
        setToken(null);
        router.replace("/login");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  return { user, loading };
}
