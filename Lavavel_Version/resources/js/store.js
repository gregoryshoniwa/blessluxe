import { createApp } from 'vue';
import App from './storefront/App.vue';
import router from './storefront/router.js';

const root = document.getElementById('store-app');
if (root) {
    createApp(App).use(router).mount(root);
}
