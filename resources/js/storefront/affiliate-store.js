/**
 * The affiliate whose shop is being browsed — shared by everything that has to
 * behave differently inside one.
 *
 * It used to be private state in the Header, so only the banner knew. That is
 * why a CURATED shop (an affiliate selling a hand-picked line) filtered its
 * product grid but still showed the Packs tile, the Packs menu link and the
 * "no products — run db:seed" developer note: nothing else could tell it was in
 * a curated shop at all.
 *
 *   import { affiliateStore } from '../affiliate-store.js';
 *   data() { return { shop: affiliateStore.state }; }
 *   computed: { curated() { return affiliateStore.isCurated(); } }
 *
 * The server is the authority on what a curated shop contains (it filters
 * products, categories and packs itself). This only decides what to DRAW.
 */
import { reactive } from 'vue';

const state = reactive({
    affiliate: null,   // { code, name, curated, product_count } | null
    loaded: false,
});

let inflight = null;
let painted = [];   // CSS variables currently overridden, so they can be undone

/**
 * Re-skin the whole storefront to the affiliate's accent.
 *
 * The brand colours are Tailwind v4 theme variables (`--color-gold`, …) and
 * every `text-gold` / `bg-gold/15` in the app compiles to `var(--color-gold)`.
 * So overriding a handful of variables on <html> recolours every page at once —
 * no per-component theming, and nothing to forget when a new page is added.
 *
 * Only names in ALLOWED are ever written, whatever the payload says.
 */
const ALLOWED = ['--color-gold', '--color-gold-dark', '--color-gold-light', '--color-cream-dark', '--color-blush'];

function paint(palette) {
    const root = document.documentElement;
    painted.forEach((name) => root.style.removeProperty(name));
    painted = [];
    if (!palette) return;
    for (const name of ALLOWED) {
        const value = palette[name];
        if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) {
            root.style.setProperty(name, value);
            painted.push(name);
        }
    }
}

async function refresh() {
    // Several components mount at once and all ask; one request answers them.
    if (inflight) return inflight;

    inflight = (async () => {
        try {
            const res = await fetch('/api/store/affiliate/active', {
                cache: 'no-store',
                credentials: 'include',
                headers: { Accept: 'application/json' },
            });
            if (res.ok) state.affiliate = (await res.json()).affiliate || null;
            paint(state.affiliate?.look?.theme || null);
        } catch {
            state.affiliate = null;
        } finally {
            state.loaded = true;
            inflight = null;
        }
        return state.affiliate;
    })();

    return inflight;
}

/** Stop shopping via the affiliate — the × on the banner. */
async function clear() {
    try {
        await fetch('/api/store/affiliate/clear', {
            method: 'POST',
            credentials: 'include',
            headers: {
                Accept: 'application/json',
                'X-XSRF-TOKEN': decodeURIComponent((document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || ''),
            },
        });
    } catch { /* leaving anyway */ }
    state.affiliate = null;
    paint(null);   // back to the house gold immediately
    // Everything narrowed to their line — menu, tiles, grid — must widen again.
    window.dispatchEvent(new CustomEvent('blessluxe:affiliate-changed'));
}

// Opening an affiliate link, or clearing one, changes the answer.
window.addEventListener('blessluxe:affiliate-changed', () => { refresh(); });

export const affiliateStore = {
    state,
    refresh,
    clear,
    /** Browsing a shop that sells only what its affiliate picked. */
    isCurated() { return Boolean(state.affiliate?.curated); },
    /** …and they haven't picked anything yet. */
    isEmptyCurated() { return Boolean(state.affiliate?.curated) && state.affiliate.product_count === 0; },
    /** Their own top-bar lines, or null for BLESSLUXE's. */
    topBar() { return state.affiliate?.look?.top_bar || null; },
    /** Preview a palette without saving (the design editor). */
    paint,
};
