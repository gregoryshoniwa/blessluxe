/**
 * Tiny localStorage-backed history of product ids the customer has visited.
 * Trimmed to MAX entries (most-recent first). De-duped so revisiting a
 * product moves it to the top instead of adding a second entry.
 */
const KEY = 'blessluxe:recently-viewed';
const MAX = 10;

function read() {
    if (typeof localStorage === 'undefined') return [];
    try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}
function write(ids) {
    try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* skip */ }
}

export const recentlyViewed = {
    /** Push a product to the front of the list. Idempotent on re-visit. */
    record(productId) {
        if (!productId) return;
        const ids = read().filter((id) => id !== productId);
        ids.unshift(productId);
        write(ids.slice(0, MAX));
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('blessluxe:recently-viewed-updated'));
        }
    },
    /** All saved ids, most-recent first. Pass `exclude` to drop the current product. */
    ids(exclude = null) {
        return read().filter((id) => id !== exclude);
    },
    clear() {
        try { localStorage.removeItem(KEY); } catch { /* skip */ }
    },
};
