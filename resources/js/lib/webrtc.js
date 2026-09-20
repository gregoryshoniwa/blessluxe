/**
 * One-to-one voice and video calling over WebRTC.
 *
 * Signalling rides CLIENT EVENTS (whispers) on the presence channel the chat
 * already uses. Nothing about a call touches Laravel except fetching ICE
 * servers, which means no new tables, no new broadcast events and no way for a
 * call to interfere with the message thread it sits beside.
 *
 * Two properties of Reverb's `accept_client_events_from = 'members'` mode are
 * load-bearing here:
 *   1. Only authenticated members of the channel can whisper, so an outsider
 *      cannot inject an offer.
 *   2. Reverb stamps `user_id` on every whisper SERVER-side from the presence
 *      auth payload. A peer therefore cannot lie about who it is, which is what
 *      makes "ignore my own echo" and "route the answer back" safe.
 *
 * Media itself never passes through Reverb — only the SDP and ICE candidates
 * do, and those are kept small by trickling candidates individually rather than
 * waiting for gathering to finish. Reverb's default max_message_size is 10 KB
 * and a bundled offer can exceed it.
 */

const STATES = ['idle', 'ringing-out', 'ringing-in', 'connecting', 'active', 'ended'];

function newCallId() {
    return 'call_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/**
 * @param {object} opts
 * @param {string} opts.channel   presence channel name, e.g. 'affiliate.aff_1'
 * @param {Function} opts.whisper (channel, event, payload) => void
 * @param {string} opts.iceUrl    endpoint returning {ice_servers, ring_seconds}
 * @param {Function} opts.onChange called with the engine's public state
 */
export function createCallEngine({ channel, whisper, iceUrl, onChange }) {
    let pc = null;
    let localStream = null;
    let ringTimer = null;
    let iceConfig = null;

    const state = {
        status: 'idle',
        callId: null,
        withVideo: false,
        muted: false,
        cameraOff: false,
        // Set when the peer is reachable only via a relay-less path and the
        // connection fails — the UI needs to distinguish "declined" from
        // "your network wouldn't let this through".
        error: null,
        hasRelay: true,
        startedAt: null,
        remoteStream: null,
        localStream: null,
        peerName: null,
    };

    function emit(patch = {}) {
        Object.assign(state, patch);
        onChange({ ...state });
    }

    async function ice() {
        if (iceConfig) return iceConfig;
        try {
            const r = await fetch(iceUrl, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
            iceConfig = await r.json();
        } catch {
            // Falling back to a bare public STUN list is better than refusing
            // to call at all — most calls connect on STUN alone.
            iceConfig = { ice_servers: [{ urls: ['stun:stun.l.google.com:19302'] }], ring_seconds: 45, has_relay: false };
        }
        return iceConfig;
    }

    async function makePeer() {
        const cfg = await ice();
        state.hasRelay = Boolean(cfg.has_relay);

        const peer = new RTCPeerConnection({ iceServers: cfg.ice_servers });

        peer.onicecandidate = (e) => {
            // Trickle: send each candidate as it arrives. Waiting for gathering
            // to complete would produce one oversized signalling message and
            // add seconds of silence before the call connects.
            if (e.candidate && state.callId) {
                whisper(channel, 'call-ice', { callId: state.callId, candidate: e.candidate.toJSON() });
            }
        };

        peer.ontrack = (e) => {
            emit({ remoteStream: e.streams[0] });
        };

        peer.onconnectionstatechange = () => {
            if (peer.connectionState === 'connected') {
                clearTimeout(ringTimer);
                emit({ status: 'active', startedAt: state.startedAt || Date.now(), error: null });
            }
            if (peer.connectionState === 'failed') {
                // The honest message matters: without TURN this is the expected
                // outcome on maybe 15% of networks, and "call failed" with no
                // reason sends people hunting for a bug that isn't there.
                finish(state.hasRelay
                    ? 'The connection dropped.'
                    : "Couldn't connect on this network. A relay (TURN) server isn't configured.");
            }
        };

        return peer;
    }

    async function getMedia(withVideo) {
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: withVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        });
        emit({ localStream });
        return localStream;
    }

    function teardown() {
        clearTimeout(ringTimer);
        // Candidates and offers are per-call. Leaving them behind means the
        // next call starts by applying the previous call's dead routes.
        pendingOffer = null;
        earlyCandidates = [];
        localStream?.getTracks().forEach((t) => t.stop());
        localStream = null;
        try { pc?.close(); } catch { /* already closed */ }
        pc = null;
    }

    function finish(error = null) {
        teardown();
        emit({
            status: 'idle', callId: null, remoteStream: null, localStream: null,
            startedAt: null, muted: false, cameraOff: false, error, peerName: null,
        });
    }

    /** Place a call. */
    async function start(withVideo, peerName = null) {
        if (state.status !== 'idle') return;
        const callId = newCallId();
        emit({ status: 'ringing-out', callId, withVideo, error: null, peerName });

        try {
            const stream = await getMedia(withVideo);
            pc = await makePeer();
            stream.getTracks().forEach((t) => pc.addTrack(t, stream));

            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            whisper(channel, 'call-offer', { callId, sdp: offer.sdp, video: withVideo });

            const cfg = await ice();
            ringTimer = setTimeout(() => {
                if (state.status === 'ringing-out') {
                    whisper(channel, 'call-end', { callId, reason: 'timeout' });
                    finish('No answer.');
                }
            }, (cfg.ring_seconds || 45) * 1000);
        } catch (e) {
            finish(e?.name === 'NotAllowedError'
                ? 'Microphone or camera permission was denied.'
                : 'Could not start the call.');
        }
    }

    /** Answer the call currently ringing in. */
    async function answer() {
        if (state.status !== 'ringing-in' || !pendingOffer) return;
        const { callId, sdp, video } = pendingOffer;
        pendingOffer = null;
        emit({ status: 'connecting' });

        try {
            const stream = await getMedia(video);
            pc = await makePeer();
            stream.getTracks().forEach((t) => pc.addTrack(t, stream));

            await pc.setRemoteDescription({ type: 'offer', sdp });
            for (const c of earlyCandidates) { try { await pc.addIceCandidate(c); } catch { /* stale */ } }
            earlyCandidates = [];

            const ans = await pc.createAnswer();
            await pc.setLocalDescription(ans);
            whisper(channel, 'call-answer', { callId, sdp: ans.sdp });
        } catch (e) {
            whisper(channel, 'call-end', { callId, reason: 'failed' });
            finish(e?.name === 'NotAllowedError'
                ? 'Microphone or camera permission was denied.'
                : 'Could not answer the call.');
        }
    }

    function hangUp(reason = 'ended') {
        if (state.callId) whisper(channel, 'call-end', { callId: state.callId, reason });
        // Hanging up is not an error on this side — the other side is the one
        // that gets told why.
        finish(null);
    }

    function toggleMute() {
        const track = localStream?.getAudioTracks()[0];
        if (!track) return;
        track.enabled = !track.enabled;
        emit({ muted: !track.enabled });
    }

    function toggleCamera() {
        const track = localStream?.getVideoTracks()[0];
        if (!track) return;
        track.enabled = !track.enabled;
        emit({ cameraOff: !track.enabled });
    }

    // ─── Inbound signalling ────────────────────────────────────────────────
    let pendingOffer = null;
    let earlyCandidates = [];

    const handlers = {
        'client-call-offer': async (data) => {
            // Already on a call — tell them rather than letting it ring out.
            if (state.status !== 'idle') {
                whisper(channel, 'call-end', { callId: data.callId, reason: 'busy' });
                return;
            }
            pendingOffer = data;
            earlyCandidates = [];
            const cfg = await ice();
            emit({ status: 'ringing-in', callId: data.callId, withVideo: Boolean(data.video), error: null });
            ringTimer = setTimeout(() => {
                if (state.status === 'ringing-in') finish(null);
            }, (cfg.ring_seconds || 45) * 1000);
        },

        'client-call-answer': async (data) => {
            // Someone else on the channel answered a call we were also being
            // offered — stop our ring rather than leaving a ghost.
            if (state.status === 'ringing-in' && data.callId === state.callId) {
                finish(null);
                return;
            }
            if (state.status !== 'ringing-out' || data.callId !== state.callId) return;
            clearTimeout(ringTimer);
            emit({ status: 'connecting' });
            try {
                await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
                // The callee trickles candidates the moment it answers, so some
                // routinely arrive before this remote description is applied.
                // They were parked rather than dropped — apply them now, or the
                // call can fail to find a path it actually had.
                for (const c of earlyCandidates) { try { await pc.addIceCandidate(c); } catch { /* stale */ } }
                earlyCandidates = [];
            } catch {
                finish('The call could not be set up.');
            }
        },

        'client-call-ice': async (data) => {
            if (data.callId !== state.callId) return;
            // Candidates can arrive before we've applied the remote
            // description; dropping them silently costs connectivity.
            if (!pc || !pc.remoteDescription) { earlyCandidates.push(data.candidate); return; }
            try { await pc.addIceCandidate(data.candidate); } catch { /* stale candidate */ }
        },

        'client-call-end': (data) => {
            if (data.callId !== state.callId) return;
            const reason = { busy: 'They are on another call.', declined: 'Call declined.', timeout: 'No answer.' }[data.reason] || null;
            finish(reason);
        },
    };

    return {
        handlers,
        start,
        answer,
        hangUp,
        decline: () => { pendingOffer = null; hangUp('declined'); },
        toggleMute,
        toggleCamera,
        destroy: teardown,
        STATES,
    };
}
