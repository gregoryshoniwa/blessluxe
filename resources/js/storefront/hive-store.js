/**
 * Bless Hive — who I am in the Hive, and the two doors in front of every action.
 *
 * Reading the Hive is open to everyone. Doing anything (post, like, follow)
 * needs (1) an account and (2) the one-time 18+ confirmation. Every button goes
 * through `hiveStore.ready()` so those two doors behave identically everywhere:
 *
 *   if (!await hiveStore.ready(this.$router, this.$route)) return;
 *   await api.post(`/api/account/hive/looks/${id}/like`);
 *
 * The server enforces both; this only decides what to show.
 */
import { reactive } from 'vue';
import { api } from '../lib/api.js';
import { authStore } from './auth-store.js';

const state = reactive({
    me: null,            // my page, as the API presents it
    options: { shapes: [], occasions: [] },
    gateOpen: false,     // the 18+ confirmation sheet
    composerOpen: false, // "share a look" — one composer, owned by the shell
    composerPreset: null, // e.g. { challengeId } when opened from a challenge
    unread: 0,           // Activity badge
});

let gateResolve = null;
let inflight = null;

async function load(force = false) {
    if (state.me && state.options.occasions.length && !force) return state.me;
    if (inflight) return inflight;

    inflight = (async () => {
        try {
            if (!(await authStore.check())) { state.me = null; return null; }
            const d = await api.get('/api/account/hive/me');
            state.me = d.me;
            state.options = d.options || state.options;
        } catch {
            state.me = null;
        } finally {
            inflight = null;
        }
        return state.me;
    })();

    return inflight;
}

function setMe(me) { state.me = me; }

/** Both doors. Resolves true when the action may go ahead. */
async function ready(router, route) {
    if (!(await authStore.check())) {
        router.push({ path: '/account/login', query: { next: route?.fullPath || '/hive' } });
        return false;
    }
    const me = await load();
    if (!me) return false;
    if (me.adult_confirmed) return true;

    state.gateOpen = true;
    return new Promise((resolve) => { gateResolve = resolve; });
}

async function confirmAdult() {
    const d = await api.put('/api/account/hive/me', { confirm_adult: true });
    state.me = d.me;
    settleGate(true);
}

function settleGate(answer) {
    state.gateOpen = false;
    gateResolve?.(answer);
    gateResolve = null;
}

/** Open the look composer from anywhere (nav button, a page, an empty state). */
async function compose(router, route, preset = null) {
    if (!(await ready(router, route))) return;
    state.composerPreset = preset;
    state.composerOpen = true;
}

/** The shell announces a new look; whichever page is showing adds it to its list. */
function posted(look) {
    state.composerOpen = false;
    if (state.me) state.me.looks += 1;
    window.dispatchEvent(new CustomEvent('blessluxe:hive-posted', { detail: look }));
}

async function refreshUnread() {
    if (!authStore.state.signedIn) { state.unread = 0; return; }
    try { state.unread = (await api.get('/api/account/hive/activity')).unread || 0; } catch { /* keep the last number */ }
}

function reset() { state.me = null; state.unread = 0; }

export const hiveStore = { state, load, setMe, ready, confirmAdult, settleGate, compose, posted, refreshUnread, reset };

/** "3h", "2d", "14 Sep" — short, because it sits beside a name on a phone. */
export function timeAgo(iso) {
    const then = new Date(iso);
    const mins = Math.floor((Date.now() - then.getTime()) / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h`;
    if (mins < 10080) return `${Math.floor(mins / 1440)}d`;
    return then.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function occasionLabel(key) {
    return String(key || '').replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

/** Links travel by WhatsApp here, so that is the share button. */
export function whatsappShare(text, path) {
    const url = `${window.location.origin}${path}`;
    return `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
}
