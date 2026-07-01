/**
 * Tiny shared checkout draft store — keeps email/address/shipping between
 * the three checkout steps without reaching for Pinia. Persisted to
 * localStorage so a hard refresh doesn't drop the customer back to step 1.
 *
 * The shape is intentionally JSON-compatible: a plain object, no reactive
 * wrappers exposed. Vue pages read `draft` (read-only) and call mutate()
 * to write — which fires a "blessluxe:checkout-updated" event so any
 * other component listening can react.
 */
const KEY = 'blessluxe:checkout-draft';

const empty = () => ({
    email: '',
    first_name: '',
    last_name: '',
    phone: '',
    shipping_address: {
        address1: '',
        address2: '',
        city: '',
        province: '',
        postal_code: '',
        country: 'Zimbabwe',
    },
    shipping_method: 'standard',
});

function load() {
    if (typeof window === 'undefined') return empty();
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return empty();
        return { ...empty(), ...JSON.parse(raw) };
    } catch {
        return empty();
    }
}

export const checkoutStore = {
    get draft() {
        return load();
    },
    mutate(patch) {
        const next = { ...load(), ...patch };
        try {
            localStorage.setItem(KEY, JSON.stringify(next));
        } catch {
            /* private mode / quota exceeded — keep going */
        }
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('blessluxe:checkout-updated', { detail: next }));
        }
        return next;
    },
    clear() {
        try {
            localStorage.removeItem(KEY);
        } catch {
            /* swallow */
        }
    },
};
