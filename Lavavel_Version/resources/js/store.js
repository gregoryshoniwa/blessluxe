import { createApp } from 'vue';
import App from './storefront/App.vue';
import router from './storefront/router.js';
import { primeCsrf } from './lib/api.js';
import { wishlist } from './storefront/wishlist-store.js';

const root = document.getElementById('store-app');
if (root) {
    // Fire-and-forget: makes sure the XSRF-TOKEN cookie is set before the
    // user clicks Sign in / Sign up, so the first POST already carries it.
    void primeCsrf();
    // Boot the wishlist after CSRF is in flight — auth detection + guest
    // merge happen on the first paint so badges show the right count.
    void wishlist.boot();
    createApp(App).use(router).mount(root);
}
