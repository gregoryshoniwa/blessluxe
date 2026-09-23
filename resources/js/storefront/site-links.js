/**
 * Which fixed links the shop shows — the nav entries beside the catalogue
 * menus, and the footer's help and company links. Staff decide at
 * /admin/content; everything optional is off until they switch it on.
 *
 * One fetch for the whole app: the header, both footers and the mobile menu
 * read the same answer.
 *
 *   siteLinks.state.header   — [{ key, label, href }]
 *   siteLinks.shows('hive')  — boolean
 */
import { reactive } from 'vue';
import { api } from '../lib/api.js';

export const state = reactive({ header: [], help: [], company: [], loaded: false });

let inFlight = null;

export const siteLinks = {
    state,

    /** Safe to call from every component; the request is shared. */
    load() {
        if (state.loaded || inFlight) return inFlight;
        inFlight = api.get('/api/store/site-links')
            .then((d) => {
                Object.assign(state, d.links || {});
                state.loaded = true;
            })
            // A failure leaves the menus with only what's always there, which is
            // the safe direction: a missing link beats a broken one.
            .catch(() => { state.loaded = true; })
            .finally(() => { inFlight = null; });

        return inFlight;
    },

    shows(key) {
        return [...state.header, ...state.help, ...state.company].some((l) => l.key === key);
    },
};
