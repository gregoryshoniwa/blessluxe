/**
 * Realtime transport (Echo over Reverb, Pusher, or nothing at all).
 *
 * Deliberately lazy and deliberately optional. A socket server is a separate
 * process: locally it only exists while `php artisan reverb:start` is running,
 * and in production it depends on a managed cluster being configured. Every
 * caller therefore treats realtime as an ENHANCEMENT — the polling fallback in
 * each inbox keeps working if this never connects, so a chat is never dead just
 * because a socket is.
 *
 * It is also deliberately FRUGAL. Every hosted socket service — managed Reverb,
 * Pusher, Ably — meters peak concurrent connections, and their free tiers are
 * defined by it. So the rule is: a socket exists only while somebody is
 * actually inside a conversation. Nothing connects on page load, and the
 * connection is closed again shortly after the last subscriber leaves — a
 * shopper browsing the storefront never holds one. That is what lets a free
 * tier of 100–200 connections serve thousands of users: the limit applies to
 * chats open at the same instant, not to accounts.
 *
 * And when a provider's cap IS reached, the refused client just reports
 * 'unavailable' and its inbox keeps polling. Overflow degrades; it never bills.
 *
 * Provider is an env choice (VITE_REALTIME_DRIVER), not a code change:
 *   reverb  self-hosted or Laravel Cloud           VITE_REVERB_*
 *   pusher  Pusher, or anything speaking its       VITE_PUSHER_APP_KEY,
 *           protocol (Ably's adapter, Soketi)      VITE_PUSHER_APP_CLUSTER | VITE_PUSHER_HOST
 *   none    no socket at all — polling only
 *
 *   import { subscribe } from '../lib/realtime.js';
 *   const off = subscribe('affiliate.aff_123', {
 *       'message.sent': (e) => { ... },
 *   });
 *   // later
 *   off();
 */
let echoPromise = null;
let idleTimer = null;

// How long to keep an unused socket before closing it. Long enough that moving
// between two chat screens reuses the connection instead of paying a fresh
// TLS + auth handshake; short enough not to occupy a billed slot for nothing.
const IDLE_CLOSE_MS = 20000;

const env = import.meta.env;

function driver() {
    const chosen = (env.VITE_REALTIME_DRIVER || '').toLowerCase();
    if (chosen === 'none') return null;
    if (chosen === 'pusher') return env.VITE_PUSHER_APP_KEY ? 'pusher' : null;
    if (chosen === 'reverb') return env.VITE_REVERB_APP_KEY ? 'reverb' : null;
    // Unset: whichever has credentials, so existing setups keep working.
    if (env.VITE_REVERB_APP_KEY) return 'reverb';
    if (env.VITE_PUSHER_APP_KEY) return 'pusher';
    return null;
}

function configured() {
    return driver() !== null;
}

function connectionOptions() {
    if (driver() === 'pusher') {
        const hosted = {
            broadcaster: 'pusher',
            key: env.VITE_PUSHER_APP_KEY,
            cluster: env.VITE_PUSHER_APP_CLUSTER || 'mt1',
            forceTLS: true,
        };
        // A custom host means a Pusher-PROTOCOL service rather than Pusher
        // itself (Ably's adapter, a Soketi box).
        return env.VITE_PUSHER_HOST
            ? { ...hosted, wsHost: env.VITE_PUSHER_HOST, wsPort: 80, wssPort: 443, enabledTransports: ['ws', 'wss'] }
            : hosted;
    }
    return {
        broadcaster: 'reverb',
        key: env.VITE_REVERB_APP_KEY,
        wsHost: env.VITE_REVERB_HOST,
        wsPort: env.VITE_REVERB_PORT ?? 80,
        wssPort: env.VITE_REVERB_PORT ?? 443,
        forceTLS: (env.VITE_REVERB_SCHEME ?? 'https') === 'https',
        enabledTransports: ['ws', 'wss'],
    };
}

// ─── Connection health ─────────────────────────────────────────────────────
// 'idle' → 'connecting' → 'connected', or 'unavailable' when the socket can't
// be had: server down, network gone, or the provider refusing the connection
// because its concurrent-connection cap is full. Callers use this to decide how
// hard to poll and whether to offer features that NEED a socket (calls).

let status = 'idle';
const statusListeners = new Set();

function setStatus(next) {
    if (next === status) return;
    status = next;
    statusListeners.forEach((fn) => { try { fn(status); } catch { /* listener's problem */ } });
}

/** Subscribe to connection health. Fires immediately with the current value. */
export function onRealtimeStatus(fn) {
    statusListeners.add(fn);
    fn(status);
    return () => statusListeners.delete(fn);
}

/**
 * Which half of the app this bundle is. One browser can hold a customer session
 * AND a staff session; the server picks the identity for channel auth from
 * this, so a storefront tab joins as the customer and an admin tab as staff
 * rather than both collapsing into a single presence member. It only selects
 * between sessions that exist — it can't grant one.
 */
function side() {
    return window.location.pathname.startsWith('/admin') ? 'admin' : 'affiliate';
}

/** Loaded on first use so the socket libraries stay out of the initial bundle. */
async function getEcho() {
    if (!configured()) return null;
    if (echoPromise) return echoPromise;

    echoPromise = (async () => {
        try {
            const [{ default: Echo }, { default: Pusher }] = await Promise.all([
                import('laravel-echo'),
                import('pusher-js'),
            ]);

            window.Pusher = Pusher;
            setStatus('connecting');

            const echo = new Echo({
                ...connectionOptions(),
                // Channel auth rides the session cookie, same as every other
                // request the SPA makes. `headers` must exist — Echo writes the
                // CSRF token into it.
                withCredentials: true,
                auth: { headers: {}, params: { as: side() } },
            });

            // pusher-js states: connecting | connected | unavailable | failed |
            // disconnected. Anything that isn't working is 'unavailable' to us —
            // including 'failed', which is what an over-quota refusal (close
            // code 4004) ends in, since the library correctly won't retry it.
            echo.connector?.pusher?.connection?.bind('state_change', ({ current }) => {
                if (current === 'connected') setStatus('connected');
                else if (current === 'connecting') setStatus('connecting');
                else setStatus('unavailable');
            });

            return echo;
        } catch (e) {
            // A missing or unreachable socket server must never break a page.
            console.warn('[realtime] unavailable, falling back to polling', e);
            setStatus('unavailable');
            return null;
        }
    })();

    return echoPromise;
}

/**
 * How many independent callers hold each channel.
 *
 * Two components legitimately subscribe to the same presence channel — the
 * message thread and the call panel — and Echo hands both the same underlying
 * channel object. Without refcounting, whichever unmounts first would call
 * `echo.leave()` and silently cut the other one's socket. That failure looks
 * exactly like "realtime randomly stops working".
 */
const holders = new Map();

function open(echo, channel, type) {
    return type === 'private' ? echo.private(channel) : echo.join(channel);
}

/** Close the socket once nothing has wanted it for a little while. */
function scheduleIdleClose() {
    clearTimeout(idleTimer);
    if (holders.size > 0) return;

    idleTimer = setTimeout(async () => {
        if (holders.size > 0 || !echoPromise) return;
        const echo = await echoPromise;
        // Re-check: a subscriber may have arrived while we awaited.
        if (holders.size > 0) return;
        try { echo?.disconnect(); } catch { /* already gone */ }
        echoPromise = null;
        setStatus('idle');
    }, IDLE_CLOSE_MS);
}

/**
 * Subscribe to a channel and bind handlers.
 *
 * @param {string} channel  e.g. 'affiliate.aff_123'
 * @param {object} handlers map of event name -> callback. On presence channels
 *                          three names are special: `here`, `joining` and
 *                          `leaving` bind to membership, not to an event.
 * @param {object} [opts]
 * @param {'presence'|'private'} [opts.type='presence']
 * @returns {Function} call to leave and unbind.
 */
export function subscribe(channel, handlers = {}, { type = 'presence' } = {}) {
    let left = false;
    let joined = null;

    clearTimeout(idleTimer);
    holders.set(channel, (holders.get(channel) ?? 0) + 1);

    getEcho().then((echo) => {
        // Unsubscribed before the socket finished connecting.
        if (!echo || left) return;

        joined = open(echo, channel, type);

        for (const [event, fn] of Object.entries(handlers)) {
            if (type === 'presence' && event === 'here') joined.here(fn);
            else if (type === 'presence' && event === 'joining') joined.joining(fn);
            else if (type === 'presence' && event === 'leaving') joined.leaving(fn);
            // A leading dot tells Echo the name is already fully qualified, so
            // this binds both broadcast events (`message.sent`) and whispers
            // (`client-call-offer`) by their exact wire name.
            else joined.listen(`.${event}`, fn);
        }
    });

    return () => {
        if (left) return;
        left = true;

        const remaining = (holders.get(channel) ?? 1) - 1;
        if (remaining > 0) {
            holders.set(channel, remaining);
            // Someone else is still on this channel — keep the socket. Echo has
            // no per-handler unbind, so the handlers stay bound; they are cheap
            // and their components are gone.
            joined = null;
            return;
        }

        holders.delete(channel);
        if (joined) {
            getEcho().then((echo) => echo?.leave(channel));
            joined = null;
        }
        scheduleIdleClose();
    };
}

/**
 * Client-to-client event on a presence channel — used for typing and call
 * signalling, neither of which is worth a database write or a server round trip.
 */
export async function whisper(channel, event, payload = {}) {
    // Only ever whisper on a channel something has actually joined. Joining
    // here as a side effect would open a connection nobody is accounting for.
    if (!channel || !holders.has(channel)) return;
    const echo = await getEcho();
    if (!echo) return;
    try {
        echo.join(channel).whisper(event, payload);
    } catch { /* not connected — whispers are best-effort */ }
}

export function realtimeEnabled() {
    return configured();
}
