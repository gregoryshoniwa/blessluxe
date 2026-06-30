import { createRouter, createWebHistory } from 'vue-router';

const routes = [
    { path: '/admin',            name: 'admin-dashboard', component: () => import('./pages/Dashboard.vue') },
    { path: '/admin/login',      name: 'admin-login',     component: () => import('./pages/Login.vue'), meta: { layout: 'blank' } },
    { path: '/admin/products',   name: 'admin-products',  component: () => import('./pages/Products.vue') },
    { path: '/admin/inventory',  name: 'admin-inventory', component: () => import('./pages/Inventory.vue') },
    { path: '/admin/headings',   name: 'admin-headings',  component: () => import('./pages/Headings.vue') },
    { path: '/admin/catalogues', name: 'admin-catalogues', component: () => import('./pages/Catalogues.vue') },
    { path: '/admin/customers',  name: 'admin-customers', component: () => import('./pages/Customers.vue') },
    { path: '/admin/reviews',    name: 'admin-reviews',   component: () => import('./pages/Reviews.vue') },
    { path: '/admin/affiliates', name: 'admin-affiliates', component: () => import('./pages/Affiliates.vue') },
    { path: '/admin/regions',    name: 'admin-regions',   component: () => import('./pages/Regions.vue') },
    { path: '/admin/:pathMatch(.*)*', name: 'admin-404', component: () => import('./pages/NotFound.vue') },
];

const router = createRouter({
    history: createWebHistory(),
    routes,
    scrollBehavior: () => ({ top: 0 }),
});

export default router;
