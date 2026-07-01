import { createApp } from 'vue';
import App from './admin/App.vue';
import router from './admin/router.js';
import { primeCsrf } from './lib/api.js';

const root = document.getElementById('admin-app');
if (root) {
    void primeCsrf();
    createApp(App).use(router).mount(root);
}
