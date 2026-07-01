import { createRouter, createWebHistory } from 'vue-router';

const routes = [
    { path: '/admin',            name: 'admin-dashboard', component: () => import('./pages/Dashboard.vue') },
    { path: '/admin/login',      name: 'admin-login',     component: () => import('./pages/Login.vue'), meta: { layout: 'blank' } },
    { path: '/admin/products',     name: 'admin-products',         component: () => import('./pages/Products.vue') },
    { path: '/admin/products/:id', name: 'admin-product-editor', component: () => import('./pages/ProductEditor.vue') },
    { path: '/admin/inventory',  name: 'admin-inventory', component: () => import('./pages/Inventory.vue') },
    { path: '/admin/headings',   name: 'admin-headings',  component: () => import('./pages/Headings.vue') },
    { path: '/admin/catalogues', name: 'admin-catalogues', component: () => import('./pages/Catalogues.vue') },
    { path: '/admin/customers',  name: 'admin-customers', component: () => import('./pages/Customers.vue') },
    { path: '/admin/reviews',    name: 'admin-reviews',   component: () => import('./pages/Reviews.vue') },
    { path: '/admin/affiliates', name: 'admin-affiliates', component: () => import('./pages/Affiliates.vue') },
    { path: '/admin/affiliates/:id', name: 'admin-affiliate-detail', component: () => import('./pages/AffiliateDetail.vue') },
    { path: '/admin/regions',    name: 'admin-regions',   component: () => import('./pages/Regions.vue') },
    { path: '/admin/blits',      name: 'admin-blits',     component: () => import('./pages/Blits.vue') },
    { path: '/admin/packs',      name: 'admin-packs',     component: () => import('./pages/Packs.vue') },
    { path: '/admin/packages',   name: 'admin-packages',  component: () => import('./pages/Packages.vue') },
    { path: '/admin/orders',     name: 'admin-orders',         component: () => import('./pages/Orders.vue') },
    { path: '/admin/orders/:id', name: 'admin-order-detail',   component: () => import('./pages/OrderDetail.vue') },
    { path: '/admin/content',    name: 'admin-content',   component: () => import('./pages/Content.vue') },
    { path: '/admin/faqs',       name: 'admin-faqs',      component: () => import('./pages/Faqs.vue') },
    { path: '/admin/reports',    name: 'admin-reports',   component: () => import('./pages/Reports.vue') },
    { path: '/admin/users',      name: 'admin-users',     component: () => import('./pages/Users.vue') },
    { path: '/admin/returns',    name: 'admin-returns',   component: () => import('./pages/Returns.vue') },
    { path: '/admin/ai',         name: 'admin-ai-studio', component: () => import('./pages/AiStudio.vue') },
    { path: '/admin/:pathMatch(.*)*', name: 'admin-404', component: () => import('./pages/NotFound.vue') },
];

const router = createRouter({
    history: createWebHistory(),
    routes,
    scrollBehavior: () => ({ top: 0 }),
});

export default router;
