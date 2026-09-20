/**
 * Make a phone clip small enough to be worth watching on paid data.
 *
 * A 30-second clip straight from a phone camera is 40–70 MB. There is no video
 * service behind Bless Hive (that is a monthly bill), so the shrinking happens
 * here, in the poster's browser: the clip is played into a small canvas and
 * re-recorded at a bitrate chosen to fit the server's real limit. 30 seconds at
 * 480px comes out around 2–3 MB.
 *
 *   const out = await prepareClip(file, { maxSeconds: 30, maxBytes, onProgress });
 *   // → { video: File, poster: File, seconds, compressed }
 *
 * It runs in real time (a 20s clip takes ~20s), so callers show progress.
 * Throws an Error with a message fit to show a person.
 */

const TARGET_WIDTH = 480;
// Set `window.__clipDebug = true` in the console to trace a failing phone.
const trace = (...a) => { if (typeof window !== 'undefined' && window.__clipDebug) console.log('[clip]', ...a); };
const SMALL_ENOUGH = 3.5 * 1024 * 1024;   // already this small? upload it untouched
// Not lower: Chrome's AAC encoder rejects 64 kbps with an EncodingError, and
// after ANY recorder error in a page, later captured playback hangs. So the
// rule here is never to provoke one — the probe uses this same figure.
const AUDIO_BITS = 96_000;

export function canCompress() {
    return typeof MediaRecorder !== 'undefined' && !!HTMLCanvasElement.prototype.captureStream;
}

/**
 * Formats to try, most widely playable first. `isTypeSupported()` is only a
 * hint — Chrome says yes to H.264+AAC and then fails with an EncodingError on
 * machines without an AAC encoder — so each one is actually TRIED, and the
 * next is used the moment a recorder errors. Bare "video/mp4" is deliberately
 * absent: Chrome fills it with VP9-in-MP4, which older iPhones can't play.
 */
const FORMATS = [
    'video/mp4;codecs=avc1.42E01F,mp4a.40.2',
    'video/mp4;codecs=avc1.42E01F,opus',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
];

let workingFormat;   // cached per page load: undefined = not probed, null = none works

/** Record half a second of a blank canvas + a silent tone with this format. True only if bytes came out and nothing errored. */
function probe(mime) {
    return new Promise((resolve) => {
        let ac = null; let rec = null; let timer = 0; let bytes = 0; let settled = false;
        const done = (ok) => {
            if (settled) return;
            settled = true;
            clearInterval(timer);
            try { if (rec?.state === 'recording') rec.stop(); } catch { /* already stopped */ }
            ac?.close().catch(() => {});
            resolve(ok);
        };
        try {
            const c = document.createElement('canvas'); c.width = 64; c.height = 64;
            const g = c.getContext('2d');
            const stream = c.captureStream(24);
            try {
                ac = new (window.AudioContext || window.webkitAudioContext)();
                const dest = ac.createMediaStreamDestination();
                const osc = ac.createOscillator(); const gain = ac.createGain(); gain.gain.value = 0;
                osc.connect(gain).connect(dest); osc.start();
                dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
            } catch { /* probe picture-only */ }
            rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 300_000, audioBitsPerSecond: AUDIO_BITS });
            rec.ondataavailable = (e) => { bytes += e.data.size; };
            rec.onerror = () => done(false);
            rec.onstop = () => done(bytes > 0);
            rec.start(100);
            let n = 0;
            timer = setInterval(() => { g.fillStyle = n++ % 2 ? '#c9a84c' : '#222'; g.fillRect(0, 0, 64, 64); if (n > 6) { clearInterval(timer); try { rec.stop(); } catch { done(false); } } }, 80);
            setTimeout(() => done(false), 3000);
        } catch { done(false); }
    });
}

async function pickFormat() {
    if (workingFormat !== undefined) return workingFormat;
    workingFormat = null;
    for (const mime of FORMATS.filter((m) => MediaRecorder.isTypeSupported(m))) {
        if (await probe(mime)) { workingFormat = mime; break; }
        trace(mime, 'claimed support but failed the probe');
    }
    trace('using', workingFormat);
    return workingFormat;
}

function loadVideo(file) {
    return new Promise((resolve, reject) => {
        const v = document.createElement('video');
        v.preload = 'auto';
        v.playsInline = true;
        v.muted = true;                       // sound is routed through WebAudio below, never the speaker
        v.src = URL.createObjectURL(file);
        v.onloadedmetadata = () => resolve(v);
        v.onerror = () => reject(new Error("We couldn't read that video. Try an MP4 from your camera."));
    });
}

function seek(v, t) {
    return new Promise((resolve) => {
        const done = () => { v.removeEventListener('seeked', done); resolve(); };
        v.addEventListener('seeked', done);
        v.currentTime = t;
        setTimeout(resolve, 1500);            // some browsers never fire `seeked` on a fresh element
    });
}

async function posterOf(v, w, h) {
    await seek(v, Math.min(0.2, (v.duration || 1) / 2));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(v, 0, 0, w, h);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    if (!blob) throw new Error("We couldn't make a cover image for that video.");
    return new File([blob], 'cover.jpg', { type: 'image/jpeg' });
}

export async function prepareClip(file, { maxSeconds = 30, maxBytes = 12 * 1024 * 1024, onProgress = () => {} } = {}) {
    const v = await loadVideo(file);
    try {
        if (!v.videoWidth) throw new Error("That file doesn't look like a video.");

        const seconds = Math.min(v.duration || 0, maxSeconds);
        if (!seconds || !isFinite(seconds)) throw new Error("We couldn't tell how long that video is.");

        const scale = Math.min(1, TARGET_WIDTH / Math.min(v.videoWidth, v.videoHeight));
        const w = Math.round((v.videoWidth * scale) / 2) * 2;
        const h = Math.round((v.videoHeight * scale) / 2) * 2;
        const poster = await posterOf(v, w, h);
        const ratio = v.videoWidth / v.videoHeight;
        const shape = ratio < 0.85 ? 'tall' : ratio > 1.2 ? 'wide' : 'post';

        const fits = file.size <= Math.min(SMALL_ENOUGH, maxBytes) && v.duration <= maxSeconds + 0.5 && /mp4|webm/.test(file.type);
        if (fits) return { video: file, poster, seconds, shape, compressed: false };

        if (!canCompress()) {
            throw new Error(`This browser can't shrink videos. Pick a clip under ${Math.floor(Math.min(SMALL_ENOUGH, maxBytes) / 1048576)} MB and ${maxSeconds} seconds, or post from Chrome.`);
        }

        // Spend ~88% of the allowance, split 9:1 between picture and sound, within sane bounds.
        const budget = (Math.min(maxBytes, 4 * 1024 * 1024) * 8 * 0.88) / seconds;
        const videoBits = Math.max(250_000, Math.min(900_000, Math.round(budget * 0.9)));

        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        const stream = canvas.captureStream(24);

        trace('poster done; picking format');
        const mime = await pickFormat();
        if (!mime) throw new Error("This browser can't shrink videos. Try posting from Chrome, or pick a shorter clip.");

        // Sound comes from the element's own capture stream (it flows even while
        // the element is muted, so nothing plays out loud). Routing the element
        // through WebAudio instead wedges playback if a recorder ever fails.
        // Browsers without captureStream() get a silent clip — better than none.
        v.muted = true;
        const addSound = () => {
            try {
                const src = v.captureStream ? v.captureStream() : v.mozCaptureStream?.();
                src?.getAudioTracks().forEach((t) => { if (!stream.getAudioTracks().length) stream.addTrack(t); });
            } catch { /* silent */ }
        };

        const record = () => new Promise((resolve, reject) => {
            let rec;
            addSound();
            try { rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: videoBits, audioBitsPerSecond: AUDIO_BITS }); }
            catch { reject(new Error('unsupported')); return; }

            const chunks = [];
            let raf = 0; let guard = 0; let failed = false;
            const finish = () => { cancelAnimationFrame(raf); clearTimeout(guard); v.pause(); v.onended = null; };
            rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
            rec.onerror = (e) => { trace(mime, 'recorder error', e.error?.name); failed = true; finish(); reject(new Error('encoder')); };
            rec.onstop = () => { trace(mime, 'stopped at', v.currentTime, 'bytes', chunks.reduce((n, c) => n + c.size, 0)); finish(); if (!failed) resolve({ blob: new Blob(chunks, { type: (rec.mimeType || mime).split(';')[0] }) }); };

            const draw = () => {
                if (failed || rec.state !== 'recording') return;      // a loop from an abandoned attempt
                ctx.drawImage(v, 0, 0, w, h);
                onProgress(Math.min(1, v.currentTime / seconds));
                if (v.currentTime >= seconds || v.ended) { if (rec.state === 'recording') rec.stop(); return; }
                raf = requestAnimationFrame(draw);
            };
            v.onended = () => { if (rec.state === 'recording') rec.stop(); };

            // Recorder FIRST, then play: a captured element waits for something to
            // consume its stream, so waiting for play() before start() deadlocks.
            trace('seeking to 0; readyState=', v.readyState, 'paused=', v.paused, 'ended=', v.ended);
            seek(v, 0).then(() => {
                trace('seeked; starting recorder');
                rec.start(500);
                trace('recorder state=', rec.state, '→ play()');
                return v.play();
            }).then(() => {
                if (failed) return;
                // A backgrounded tab pauses rAF; without this the recording would never end.
                guard = setTimeout(() => { if (rec.state === 'recording') rec.stop(); }, (seconds + 4) * 1000);
                trace(mime, 'playing; ready=', v.readyState, 'audio tracks=', stream.getAudioTracks().length);
                draw();
            }).catch((err) => { trace('start failed:', err?.name, err?.message); failed = true; finish(); reject(new Error('playback')); });
        });

        let blob = null;
        try {
            ({ blob } = await record());
            // Far too small for its length means the picture never moved — not a clip worth posting.
            if (blob.size < seconds * 4000) blob = null;
        } catch (err) { trace('failed', err.message); }
        stream.getTracks().forEach((t) => t.stop());

        if (!blob) throw new Error("Shrinking that video didn't work on this phone. Try a shorter clip, or post from Chrome.");
        const type = blob.type || 'video/webm';
        if (blob.size > maxBytes) throw new Error('That clip is still too large after shrinking. Try a shorter one.');

        onProgress(1);
        return { video: new File([blob], `clip.${type.includes('mp4') ? 'mp4' : 'webm'}`, { type }), poster, seconds, shape, compressed: true };
    } finally {
        URL.revokeObjectURL(v.src);
    }
}

export function megabytes(bytes) {
    return bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
