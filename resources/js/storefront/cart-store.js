/**
 * The bag, shared by the header badge, the mini-cart drawer and anything that
 * adds to it. One fetch answers all of them, so adding an item doesn't set off
 * three separate requests for the same cart.
 *
 *   cart.state          — reactive { items, itemCount, subtotal, open, loading }
 *   cart.add(variantId, qty)  — adds and opens the drawer
 *   cart.setQty(lineId, qty)  — 0 removes the line
 *   cart.remove(lineId)
 *   cart.refresh()      — re-read from the server
 *   cart.show() / hide()
 *
 * Still fires `blessluxe:cart-updated` after every change: other components
 * (and the Hive) listen for it, and it long predates this store.
 */
import { reactive } from 'vue';
import { api } from '../lib/api.js';

export const state = reactive({
    items: [],
    itemCount: 0,
    subtotal: 0,
    open: false,
    loading: false,
    loaded: false,
});

/**
 * `notify` is false for a plain read: the header refreshes this store ON that
 * event, so announcing a read would call itself round for ever.
 */
function absorb(cart, notify = true) {
    state.items = cart?.items || [];
    state.itemCount = cart?.item_count || 0;
    state.subtotal = cart?.subtotal || 0;
    state.loaded = true;
    if (notify && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('blessluxe:cart-updated'));
}

export const cart = {
    state,

    async refresh() {
        state.loading = true;
        try {
            const { cart: c } = await api.get('/api/store/cart');
            absorb(c, false);
        } catch { /* leave what we had — a blank bag would be a lie */ }
        finally { state.loading = false; }
    },

    /** Adds, then shows the bag so the choice can be checked before paying. */
    async add(variantId, quantity = 1) {
        const { cart: c } = await api.post('/api/store/cart/line-items', { variant_id: variantId, quantity });
        absorb(c);
        this.show();

        return c;
    },

    async setQty(lineId, quantity) {
        if (quantity < 1) return this.remove(lineId);
        state.loading = true;
        try {
            const { cart: c } = await api.put(`/api/store/cart/line-items/${encodeURIComponent(lineId)}`, { quantity });
            absorb(c);
        } finally { state.loading = false; }
    },

    async remove(lineId) {
        state.loading = true;
        try {
            const { cart: c } = await api.del(`/api/store/cart/line-items/${encodeURIComponent(lineId)}`);
            absorb(c);
        } finally { state.loading = false; }
    },

    show() {
        state.open = true;
        if (!state.loaded) this.refresh();
    },
    hide() { state.open = false; },
};
