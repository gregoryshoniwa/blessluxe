/**
 * Themed dialogs and toasts, replacing window.confirm() and alert().
 *
 * The native dialogs say "127.0.0.1:8000 says", can't be styled, block the whole
 * page, and look like a browser warning rather than part of a luxury storefront.
 *
 * Usage mirrors the natives closely so call sites barely change:
 *
 *   if (!await confirmDialog({ title: 'Delete this?', tone: 'danger' })) return;
 *   toast('Saved');
 *   toast(message, { tone: 'error' });
 *
 * A single reactive store drives one <DialogHost> mounted per SPA.
 */
import { reactive } from 'vue';

export const dialogState = reactive({
    // The confirm currently on screen, or null.
    confirm: null,
    toasts: [],
});

let seq = 0;

/**
 * Ask the user to confirm. Resolves true/false — never throws, so a call site
 * can always `await` it inline the way it used to call confirm().
 *
 * @param {object|string} opts  message, or { title, body, confirmLabel, cancelLabel, tone }
 * @returns {Promise<boolean>}
 */
export function confirmDialog(opts = {}) {
    const o = typeof opts === 'string' ? { title: opts } : opts;

    return new Promise((resolve) => {
        dialogState.confirm = {
            title: o.title || 'Are you sure?',
            body: o.body || '',
            confirmLabel: o.confirmLabel || 'Confirm',
            cancelLabel: o.cancelLabel || 'Cancel',
            // 'danger' for destructive actions, 'default' otherwise.
            tone: o.tone || 'default',
            resolve,
        };
    });
}

/** Resolve and dismiss the open confirm. Called by DialogHost. */
export function settleConfirm(answer) {
    const pending = dialogState.confirm;
    dialogState.confirm = null;
    if (pending) pending.resolve(!!answer);
}

/**
 * Transient message. Errors linger longer than successes because they're
 * usually something the reader has to act on.
 */
export function toast(message, opts = {}) {
    if (!message) return;

    const tone = opts.tone || 'success';
    const id = ++seq;
    const ttl = opts.duration ?? (tone === 'error' ? 6000 : 3200);

    dialogState.toasts.push({ id, message: String(message), tone });
    setTimeout(() => dismissToast(id), ttl);

    return id;
}

export function dismissToast(id) {
    const i = dialogState.toasts.findIndex((t) => t.id === id);
    if (i !== -1) dialogState.toasts.splice(i, 1);
}

/** Convenience for the very common `catch` shape used across both SPAs. */
export function toastError(e, fallback = 'Something went wrong.') {
    const msg = e?.payload?.error
        || (e?.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
        || fallback;
    return toast(msg, { tone: 'error' });
}
