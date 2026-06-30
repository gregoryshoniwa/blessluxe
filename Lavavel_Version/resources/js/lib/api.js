/**
 * Thin fetch wrapper for talking to /api/* routes.
 *
 * Handles three things native `fetch` doesn't do on its own:
 *   1. Always sends session cookies (`credentials: 'include'`).
 *   2. Sends Laravel's `XSRF-TOKEN` cookie as `X-XSRF-TOKEN` for POST/PUT/etc.
 *      — Laravel's CSRF middleware checks this for any session-bearing route.
 *   3. JSON-encodes a `body` object automatically + parses JSON responses.
 *
 * Throws an Error with `.status` + `.payload` on non-2xx so callers can
 * `try { await api.post(...) } catch (e) { e.status, e.payload.error }`.
 */

const XSRF_COOKIE = 'XSRF-TOKEN';

function readXsrfToken() {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/(^|;\s*)XSRF-TOKEN=([^;]+)/);
    // Laravel URL-encodes the cookie value.
    return match ? decodeURIComponent(match[2]) : null;
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
    const isJsonBody = body && typeof body === 'object' && !(body instanceof FormData);
    const finalHeaders = {
        Accept: 'application/json',
        ...(isJsonBody ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
    };

    const xsrf = readXsrfToken();
    if (xsrf && !/^(GET|HEAD|OPTIONS)$/i.test(method)) {
        finalHeaders['X-XSRF-TOKEN'] = xsrf;
    }

    const res = await fetch(path, {
        method,
        headers: finalHeaders,
        credentials: 'include',
        body: isJsonBody ? JSON.stringify(body) : body,
    });

    let payload = null;
    try {
        payload = await res.json();
    } catch {
        // Non-JSON responses (e.g. 204) — leave payload null.
    }

    if (!res.ok) {
        const err = new Error(payload?.error || payload?.message || `Request failed (${res.status})`);
        err.status = res.status;
        err.payload = payload;
        throw err;
    }
    return payload;
}

export const api = {
    get:  (p, opts)       => request(p, { ...opts, method: 'GET' }),
    post: (p, body, opts) => request(p, { ...opts, method: 'POST', body }),
    put:  (p, body, opts) => request(p, { ...opts, method: 'PUT',  body }),
    del:  (p, opts)       => request(p, { ...opts, method: 'DELETE' }),
};

/**
 * Prime the XSRF cookie. Call once on app boot so the first mutating
 * request can find a token in `document.cookie`. Laravel sets the cookie
 * on any session-bearing response — even a GET — so we just need to hit
 * one such route. `/api/account/me` is cheap and idempotent.
 */
export async function primeCsrf() {
    try {
        await request('/api/account/me');
    } catch {
        /* swallow — guests fail-but-still-set-cookie, which is what we want */
    }
}
