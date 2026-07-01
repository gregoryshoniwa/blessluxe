/**
 * Lightweight wishlist store. Guests use localStorage; signed-in customers
 * also persist to the server so the list follows them across devices. On
 * login the local list is merged into the account once.
 *
 * Exposes a tiny API:
 *   wishlist.ids()                — Set<string> of saved product ids
 *   wishlist.has(productId)       — boolean
 *   wishlist.toggle(productId)    — add or remove; returns the new boolean
 *   wishlist.add / remove(id)     — explicit
 *   wishlist.list()               — async; returns full product objects
 *   wishlist.refresh()            — re-sync from server (no-op for guests)
 *
 * Subscribe via window event `blessluxe:wishlist-updated` to refresh badges.
 */
import { api } from '../lib/api.js';

const KEY = 'blessluxe:wishlist-guest';

const state = {
    customerKnown: false,         // have we asked /api/account/me yet?
    signedIn: false,
    ids: new Set(),
};

function loadGuest() {
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
        return new Set();
    }
}
function saveGuest() {
    try {
        localStorage.setItem(KEY, JSON.stringify([...state.ids]));
    } catch { /* private mode etc. — skip */ }
}
function emit() {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('blessluxe:wishlist-updated', { detail: { count: state.ids.size } }));
    }
}

async function detectAuth() {
    if (state.customerKnown) return;
    try {
        const d = await api.get('/api/account/me');
        state.signedIn = !!d.customer;
    } catch {
        state.signedIn = false;
    }
    state.customerKnown = true;
}

async function refreshFromServer() {
    if (!state.signedIn) return;
    try {
        const d = await api.get('/api/account/wishlist');
        if (Array.isArray(d.items)) {
            state.ids = new Set(d.items.map((i) => i.id));
            emit();
        }
    } catch { /* leave the existing set */ }
}

/** Send any guest IDs to the server then refresh — call once on login. */
async function mergeAfterLogin() {
    const guestIds = [...loadGuest()];
    if (guestIds.length) {
        try {
            await api.post('/api/account/wishlist/merge', { product_ids: guestIds });
        } catch { /* ignore */ }
        try { localStorage.removeItem(KEY); } catch { /* skip */ }
    }
    await refreshFromServer();
}

export const wishlist = {
    async boot() {
        await detectAuth();
        if (state.signedIn) {
            await mergeAfterLogin();
        } else {
            state.ids = loadGuest();
            emit();
        }
    },
    /** Synchronous check after boot() has run at least once. */
    has(productId) { return state.ids.has(productId); },
    ids() { return new Set(state.ids); },
    count() { return state.ids.size; },
    async add(productId) {
        if (state.ids.has(productId)) return;
        state.ids.add(productId);
        if (state.signedIn) {
            try { await api.post('/api/account/wishlist', { product_id: productId }); } catch { /* leave local set; will resync on next boot */ }
        } else {
            saveGuest();
        }
        emit();
    },
    async remove(productId) {
        if (!state.ids.has(productId)) return;
        state.ids.delete(productId);
        if (state.signedIn) {
            try { await api.del(`/api/account/wishlist/${encodeURIComponent(productId)}`); } catch { /* skip */ }
        } else {
            saveGuest();
        }
        emit();
    },
    async toggle(productId) {
        if (state.ids.has(productId)) {
            await this.remove(productId);
            return false;
        }
        await this.add(productId);
        return true;
    },
    async list() {
        if (state.signedIn) {
            try {
                const d = await api.get('/api/account/wishlist');
                state.ids = new Set((d.items || []).map((i) => i.id));
                emit();
                return d.items || [];
            } catch { return []; }
        }
        // Guests: batch-resolve the saved ids in one call.
        if (!state.ids.size) return [];
        try {
            const d = await api.post('/api/store/products/batch', { ids: [...state.ids] });
            return d.products || [];
        } catch { return []; }
    },
    refresh: refreshFromServer,
};
