import { createApp } from 'vue';
import App from './admin/App.vue';
import router from './admin/router.js';

const root = document.getElementById('admin-app');
if (root) {
    createApp(App).use(router).mount(root);
}
