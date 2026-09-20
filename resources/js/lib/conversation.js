import { reactive } from 'vue';
import { api } from './api.js';
import { subscribe, whisper, realtimeEnabled, onRealtimeStatus } from './realtime.js';

/**
 * One conversation's state and transport, shared by the affiliate and admin
 * inboxes.
 *
 * Everything here is the part of a chat that is easy to get subtly wrong and
 * that both sides must get wrong in the SAME way or not at all: merging socket
 * and poll deliveries without duplicates, keeping ticks honest with or without
 * a socket, paging history backwards, not marking things read in a tab nobody
 * is looking at. The components own layout; this owns behaviour.
 *
 * Designed so the server's cost per open inbox stays flat:
 *   - the thread loads as one window of 50, then only DELTAS (`?after=`) —
 *     a quiet poll is a handful of indexed lookups returning an empty array
 *   - the poll backs off while nothing is happening and snaps back on activity
 *   - with a live socket the poll is only a slow safety net
 *
 *   const chat = createConversation({ me: 'admin', url, readUrl });
 *   await chat.open();            // → full first payload, for anything extra in it
 *   chat.connect('affiliate.x');  // optional — live updates
 *   chat.destroy();
 */

const POLL_MIN = 5000;      // no socket, conversation active
const POLL_MAX = 30000;     // no socket, conversation quiet
const POLL_LIVE = 45000;    // socket connected — safety net only
const POLL_HIDDEN = 90000;  // tab in the background

export function createConversation({ me, url, readUrl }) {
    const state = reactive({
        messages: [],
        loaded: false,
        hasMore: false,
        loadingEarlier: false,
        firstUnreadId: null,
        sending: false,
        typing: false,
        peerOnline: false,
        live: false,
    });

    let channel = null;
    let unsubscribe = null;
    let pollTimer = null;
    let typingTimer = null;
    let quietPolls = 0;
    let destroyed = false;
    let onIncoming = null;

    // ─── Merging ───────────────────────────────────────────────────────────
    // A message can arrive three ways — the POST response, the socket, a poll —
    // and often by two of them. Identity is the id; whoever gets there first
    // wins and the rest are no-ops.

    function has(id) { return state.messages.some((m) => m.id === id); }

    function append(list) {
        const fresh = list.filter((m) => !has(m.id));
        if (!fresh.length) return [];
        // Keep optimistic bubbles at the end: they are "about to exist" and
        // must not be leapfrogged by something that already does.
        const pending = state.messages.filter((m) => m.pending);
        const settled = state.messages.filter((m) => !m.pending);
        state.messages = [...settled, ...fresh, ...pending];
        return fresh;
    }

    /** Everything of mine at or before `id` has been read. */
    function applyReadUpto(id, at = null) {
        if (!id) return;
        const idx = state.messages.findIndex((m) => m.id === id);
        if (idx === -1) return;
        const stamp = at || state.messages[idx].read_at || new Date().toISOString();
        state.messages = state.messages.map((m, i) =>
            i <= idx && m.sender === me && !m.read_at && !m.pending ? { ...m, read_at: stamp } : m
        );
    }

    function lastSettledId() {
        for (let i = state.messages.length - 1; i >= 0; i--) {
            if (!state.messages[i].pending) return state.messages[i].id;
        }
        return null;
    }

    // ─── Loading ───────────────────────────────────────────────────────────

    async function open() {
        const d = await api.get(url);
        state.messages = d.messages;
        state.hasMore = Boolean(d.has_more);
        // Captured once. A poll must never overwrite it, or the "new messages"
        // line would vanish while it is still being read.
        state.firstUnreadId = d.first_unread_id || null;
        state.loaded = true;
        schedulePoll();
        return d;
    }

    async function loadEarlier() {
        const first = state.messages.find((m) => !m.pending);
        if (!first || !state.hasMore || state.loadingEarlier) return;
        state.loadingEarlier = true;
        try {
            const d = await api.get(`${url}?before=${encodeURIComponent(first.id)}`);
            const older = d.messages.filter((m) => !has(m.id));
            state.messages = [...older, ...state.messages];
            state.hasMore = Boolean(d.has_more);
        } catch { /* leave hasMore set — scrolling up again retries */ }
        finally { state.loadingEarlier = false; }
    }

    async function poll() {
        if (destroyed || !state.loaded) return;
        const after = lastSettledId();
        // A background tab keeps the thread current but must not claim the
        // messages were seen.
        const peek = document.hidden ? '&peek=1' : '';
        try {
            if (!after) {
                // Nothing to be "after" yet — an empty thread. Re-open cheaply.
                const d = await api.get(`${url}?peek=${document.hidden ? 1 : 0}`);
                append(d.messages).forEach(notifyIncoming);
                applyReadUpto(d.read_upto_id);
            } else {
                const d = await api.get(`${url}?after=${encodeURIComponent(after)}${peek}`);
                const fresh = append(d.messages);
                fresh.forEach(notifyIncoming);
                applyReadUpto(d.read_upto_id);
                quietPolls = fresh.length ? 0 : quietPolls + 1;
                if (fresh.some((m) => m.sender !== me) && !document.hidden) markTheirsRead();
            }
        } catch { quietPolls++; }
        schedulePoll();
    }

    function schedulePoll() {
        clearTimeout(pollTimer);
        if (destroyed) return;
        let wait;
        if (document.hidden) wait = POLL_HIDDEN;
        else if (state.live) wait = POLL_LIVE;
        // Back off geometrically while quiet; any activity resets quietPolls.
        else wait = Math.min(POLL_MAX, POLL_MIN * 1.5 ** quietPolls);
        pollTimer = setTimeout(poll, wait);
    }

    function onVisibility() {
        if (document.hidden) { schedulePoll(); return; }
        // Back in view: catch up now, and what's on screen is now being read.
        quietPolls = 0;
        poll();
        if (state.messages.some((m) => m.sender !== me && !m.read_at)) acknowledge();
    }

    // ─── Read state ────────────────────────────────────────────────────────

    function markTheirsRead() {
        const at = new Date().toISOString();
        state.messages = state.messages.map((m) =>
            m.sender !== me && !m.read_at ? { ...m, read_at: at } : m
        );
    }

    /** Tell the server (and so the other side) that we've seen their messages. */
    async function acknowledge() {
        try {
            await api.post(readUrl, {});
            markTheirsRead();
        } catch { /* the next visible poll marks it read anyway */ }
    }

    function notifyIncoming(m) {
        if (m.sender !== me) onIncoming?.(m);
    }

    // ─── Live ──────────────────────────────────────────────────────────────

    function connect(name) {
        if (!realtimeEnabled() || destroyed) return;
        disconnect();
        channel = name;

        const theirs = (member) => member && member.role && member.role !== me;

        unsubscribe = subscribe(channel, {
            'message.sent': ({ message }) => {
                const [fresh] = append([message]);
                if (!fresh) return;
                quietPolls = 0;
                if (message.sender === me) return;   // another tab / another admin
                state.typing = false;
                notifyIncoming(message);
                // If they're actually looking at it, say so now rather than
                // leaving the sender on a single tick until the next poll.
                if (!document.hidden) acknowledge();
            },
            // They opened the thread — flip our ticks to read.
            'messages.read': ({ reader, at }) => {
                if (reader === me) return;
                state.messages = state.messages.map((m) =>
                    m.sender === me && !m.read_at && !m.pending ? { ...m, read_at: at } : m
                );
            },
            'client-typing': () => {
                state.typing = true;
                clearTimeout(typingTimer);
                // Nobody sends a "stopped typing" reliably, so expire it.
                typingTimer = setTimeout(() => { state.typing = false; }, 3000);
            },
            // Presence. `here` firing at all is also the proof the socket works.
            here: (members) => {
                state.live = true;
                state.peerOnline = members.some(theirs);
                schedulePoll();
            },
            joining: (member) => { if (theirs(member)) state.peerOnline = true; },
            leaving: (member) => {
                if (theirs(member)) { state.peerOnline = false; state.typing = false; }
            },
        });
    }

    function disconnect() {
        unsubscribe?.();
        unsubscribe = null;
        channel = null;
        state.live = false;
        state.peerOnline = false;
        state.typing = false;
    }

    function notifyTyping() {
        whisper(channel, 'typing', {});
    }

    // ─── Sending ───────────────────────────────────────────────────────────

    async function send({ body, files = [], refs = [] }) {
        const tmpId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        // Show it immediately — waiting on a round trip makes a chat feel broken.
        // The picked cards are shown as-is; the server re-reads each one from
        // the catalogue, and its version replaces these when the send lands.
        state.messages = [...state.messages, {
            id: tmpId, sender: me, body, attachments: [], refs,
            created_at: new Date().toISOString(), pending: true,
        }];
        state.sending = true;
        quietPolls = 0;

        try {
            // Only identity goes up — never the title or price the picker showed.
            const picked = refs.map((r) => ({ type: r.type, id: r.id }));
            let payload = { body, refs: picked };
            if (files.length) {
                payload = new FormData();
                payload.append('body', body);
                // Multipart has no nested JSON; the server accepts a string here.
                payload.append('refs', JSON.stringify(picked));
                files.forEach((f) => payload.append('images[]', f));
            }
            const d = await api.post(url, payload);

            // Swap the placeholder for the real thing IN PLACE — unless the
            // socket beat the response here, in which case just drop it.
            const arrived = has(d.message.id);
            state.messages = state.messages.flatMap((m) =>
                m.id === tmpId ? (arrived ? [] : [d.message]) : [m]
            );
            return d.message;
        } catch (e) {
            // Drop the optimistic bubble rather than leaving a ghost that looks
            // sent but never arrived.
            state.messages = state.messages.filter((m) => m.id !== tmpId);
            throw e;
        } finally {
            state.sending = false;
        }
    }

    document.addEventListener('visibilitychange', onVisibility);

    /**
     * The socket can go away AFTER it proved itself — wifi drops, the server
     * restarts, a provider's connection cap fills. `live` was only ever set to
     * true, so the poll stayed on its 45s safety-net cadence while nothing was
     * actually delivering: messages arriving most of a minute late, with no
     * error anywhere. Now losing the socket puts the fast poll straight back.
     * (Regaining it needs no code: the presence `here` fires again.)
     */
    const offStatus = onRealtimeStatus((status) => {
        if (status === 'connected' || !state.live) return;
        state.live = false;
        state.peerOnline = false;
        state.typing = false;
        quietPolls = 0;
        poll();
    });

    function destroy() {
        destroyed = true;
        offStatus();
        clearTimeout(pollTimer);
        clearTimeout(typingTimer);
        document.removeEventListener('visibilitychange', onVisibility);
        disconnect();
    }

    return {
        state,
        open, loadEarlier, send, acknowledge, connect, disconnect, notifyTyping, destroy,
        /** Called for each message that arrives from the other side. */
        onIncoming(fn) { onIncoming = fn; },
        get channel() { return channel; },
    };
}
