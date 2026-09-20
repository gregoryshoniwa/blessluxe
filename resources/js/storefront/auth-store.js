/**
 * Is a customer signed in? — one answer, shared by the menu and the router.
 *
 * Before this, only the router knew (a private 30-second cache inside
 * router.js). The header had no idea, so members-only entries like Show Room
 * were offered to everyone and bounced signed-out visitors to the login page.
 * And because nothing ever told that cache about a sign-OUT, the Show Room
 * stayed reachable for up to 30 seconds after logging out.
 *
 *   import { authStore } from '../auth-store.js';
 *   data() { return { auth: authStore.state }; }      // auth.signedIn
 *
 *   await authStore.refresh();   // after login / signup
 *   authStore.clear();           // after logout — immediate, no TTL to wait out
 *
 * This decides what to DRAW and where to route. It is not security: every
 * members-only API enforces the session itself.
 */
import { reactive } from 'vue';

const FRESH_MS = 30_000;

const state = reactive({
    signedIn: false,
    customer: null,
    loaded: false,
});

let checkedAt = 0;
let inflight = null;

async function refresh() {
    // The header, the router guard and a page can all ask at once on boot.
    if (inflight) return inflight;

    inflight = (async () => {
        try {
            const res = await fetch('/api/account/me', {
                credentials: 'include',
                cache: 'no-store',
                headers: { Accept: 'application/json' },
            });
            const data = res.ok ? await res.json() : null;
            state.customer = data?.customer || null;
        } catch {
            state.customer = null;
        } finally {
            state.signedIn = Boolean(state.customer);
            state.loaded = true;
            checkedAt = Date.now();
            inflight = null;
        }
        return state.signedIn;
    })();

    return inflight;
}

/**
 * For the router guard. Only a POSITIVE answer is trusted from cache — a cached
 * "signed out" would bounce someone who has just logged in straight back to the
 * login page.
 */
async function check() {
    if (state.signedIn && Date.now() - checkedAt < FRESH_MS) return true;
    return refresh();
}

function clear() {
    state.customer = null;
    state.signedIn = false;
    state.loaded = true;
    checkedAt = 0;
}

export const authStore = { state, refresh, check, clear };
