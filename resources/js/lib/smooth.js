/**
 * Swap what's on screen without a cut.
 *
 *   await smoothSwap(() => { this.items = fresh; });
 *
 * Uses the browser's View Transitions API (Baseline: Chrome 111, Safari 18,
 * Firefox 144) to cross-fade from the old results to the new; where it isn't
 * there, or the visitor has asked for reduced motion, it simply applies the
 * change. The update runs inside the transition and waits for Vue to paint, so
 * the "after" snapshot is the real new page, not a half-rendered one.
 */
import { nextTick } from 'vue';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export async function smoothSwap(update) {
    if (typeof document === 'undefined' || !document.startViewTransition || reduced() || document.visibilityState !== 'visible') {
        update();
        await nextTick();

        return;
    }
    const t = document.startViewTransition(async () => {
        update();
        await nextTick();
    });
    try { await t.finished; } catch { /* a skipped transition is still a finished update */ }
}

/**
 * Report "the page is working" to the progress line along the top. Anything
 * that waits on the network can call `busy()` and the returned `done()`.
 */
let active = 0;
const listeners = new Set();
export function onBusy(fn) { listeners.add(fn); fn(active > 0); return () => listeners.delete(fn); }
export function busy() {
    active += 1;
    if (active === 1) listeners.forEach((fn) => fn(true));
    let finished = false;

    return function done() {
        if (finished) return;
        finished = true;
        active = Math.max(0, active - 1);
        if (active === 0) listeners.forEach((fn) => fn(false));
    };
}
