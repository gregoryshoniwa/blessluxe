"use client";

export const SHOP_BACKEND_URL =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_SHOP_BACKEND) ||
  "http://localhost:9001";

/**
 * Resolve a backend-relative media URL (e.g. "/uploads/foo.png") into an
 * absolute URL the browser can load. Absolute URLs and data URIs pass
 * through unchanged.
 */
export function mediaUrl(url: string | null | undefined): string {
  const input = String(url || "").trim();
  if (!input) return "";
  if (input.startsWith("/")) {
    return `${SHOP_BACKEND_URL.replace(/\/+$/, "")}${input}`;
  }
  return input;
}

const TOKEN_KEY = "blessluxe_admin_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  path: string,
  opts: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    accept: "application/json",
    ...((opts.headers as Record<string, string>) || {}),
  };
  const token = getToken();
  if (token) headers.authorization = `Bearer ${token}`;

  const init: RequestInit = { ...opts, headers, cache: "no-store" };
  if (opts.json !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(opts.json);
  }

  const url = path.startsWith("http") ? path : `${SHOP_BACKEND_URL}${path}`;
  const res = await fetch(url, init);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined") {
      setToken(null);
    }
    const message =
      (body as { error?: string; message?: string })?.error ||
      (body as { message?: string })?.message ||
      res.statusText;
    throw new ApiError(res.status, message, body);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, json?: unknown) => request<T>(path, { method: "POST", json }),
  patch: <T>(path: string, json?: unknown) => request<T>(path, { method: "PATCH", json }),
  put: <T>(path: string, json?: unknown) => request<T>(path, { method: "PUT", json }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  upload: async <T>(path: string, file: File): Promise<T> => {
    const fd = new FormData();
    fd.append("file", file);
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await fetch(`${SHOP_BACKEND_URL}${path}`, {
      method: "POST",
      headers,
      body: fd,
    });
    if (!res.ok) {
      throw new ApiError(res.status, `Upload failed (${res.status})`, null);
    }
    return res.json();
  },
};
