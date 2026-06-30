import { createRouter, createWebHistory } from 'vue-router';

const routes = [
    { path: '/', name: 'home', component: () => import('./pages/Home.vue') },
    { path: '/shop', name: 'shop', component: () => import('./pages/Shop.vue') },
    { path: '/shop/packs', name: 'packs', component: () => import('./pages/Packs.vue') },
    { path: '/shop/:handle', name: 'product', component: () => import('./pages/ProductDetail.vue') },
    { path: '/cart', name: 'cart', component: () => import('./pages/Cart.vue') },
    { path: '/wishlist', name: 'wishlist', component: () => import('./pages/Wishlist.vue') },
    { path: '/checkout', name: 'checkout-info', component: () => import('./pages/CheckoutInfo.vue') },
    { path: '/checkout/shipping', name: 'checkout-shipping', component: () => import('./pages/CheckoutShipping.vue') },
    { path: '/checkout/payment', name: 'checkout-payment', component: () => import('./pages/CheckoutPayment.vue') },
    { path: '/checkout/confirmation', name: 'checkout-confirmation', component: () => import('./pages/CheckoutConfirmation.vue') },
    { path: '/account', name: 'account', component: () => import('./pages/Account.vue') },
    { path: '/account/login', name: 'login', component: () => import('./pages/Login.vue') },
    { path: '/account/signup', name: 'signup', component: () => import('./pages/Signup.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./pages/NotFound.vue') },
];

const router = createRouter({
    history: createWebHistory(),
    routes,
    scrollBehavior: () => ({ top: 0 }),
});

export default router;
