import { reactive } from 'vue';

/**
 * The trail under the header ("Home › Men › Suits › Three-Piece Check Suit").
 * A route's `meta.crumbs` gives the fixed part; a page whose names come from
 * the server (a product, a department, a series, an order) calls setCrumbs()
 * once it knows them. The router resets it on every new page, so a trail can
 * never outlive the page that set it. `meta.crumbs: false` = no trail (home,
 * checkout, the Hive).
 */
export const crumbs = reactive({ items: null });

/** @param {Array<{label: string, to?: string}>} items — everything after Home; the last is this page. */
export function setCrumbs(items) {
    crumbs.items = items.filter((c) => c && c.label);
}

export function resetCrumbs(route) {
    const m = route.meta?.crumbs;
    crumbs.items = m === false ? null : (typeof m === 'function' ? m(route) : m) || null;
}
