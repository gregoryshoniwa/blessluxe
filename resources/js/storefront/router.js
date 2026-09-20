import { createRouter, createWebHistory } from 'vue-router';
import { authStore } from './auth-store.js';

const routes = [
    { path: '/', name: 'home', component: () => import('./pages/Home.vue') },
    { path: '/shop', name: 'shop', component: () => import('./pages/Shop.vue') },
    { path: '/shop/packs', name: 'packs', component: () => import('./pages/Packs.vue') },
    { path: '/shop/packs/:code', name: 'pack-campaign', component: () => import('./pages/PackCampaign.vue') },
    { path: '/shop/:handle', name: 'product', component: () => import('./pages/ProductDetail.vue') },
    { path: '/cart', name: 'cart', component: () => import('./pages/Cart.vue') },
    { path: '/wishlist', name: 'wishlist', component: () => import('./pages/Wishlist.vue') },
    { path: '/checkout', name: 'checkout-info', component: () => import('./pages/CheckoutInfo.vue') },
    { path: '/checkout/shipping', name: 'checkout-shipping', component: () => import('./pages/CheckoutShipping.vue') },
    { path: '/checkout/payment', name: 'checkout-payment', component: () => import('./pages/CheckoutPayment.vue') },
    { path: '/checkout/confirmation', name: 'checkout-confirmation', component: () => import('./pages/CheckoutConfirmation.vue') },
    { path: '/checkout/paynow/return', name: 'paynow-return', component: () => import('./pages/PaynowReturn.vue') },
    { path: '/account', name: 'account', component: () => import('./pages/Account.vue') },
    { path: '/account/login', name: 'login', component: () => import('./pages/Login.vue') },
    { path: '/account/signup', name: 'signup', component: () => import('./pages/Signup.vue') },
    { path: '/account/forgot', name: 'forgot-password', component: () => import('./pages/ForgotPassword.vue') },
    { path: '/account/reset/:token', name: 'reset-password', component: () => import('./pages/ResetPassword.vue') },
    { path: '/account/orders/:number', name: 'order-detail', component: () => import('./pages/OrderDetail.vue') },
    { path: '/showroom/:tab?', name: 'showroom', component: () => import('./pages/ShowRoom.vue'), meta: { requiresAuth: true } },
    // Bless Hive — the community. Open to read; acting needs an account.
    // `shell: 'hive'` swaps the shop's chrome for the Hive's own frame (App.vue).
    { path: '/hive',          name: 'hive',          component: () => import('./pages/Hive.vue'),         meta: { shell: 'hive' } },
    { path: '/hive/discover', name: 'hive-discover', component: () => import('./pages/HiveDiscover.vue'), meta: { shell: 'hive' } },
    { path: '/hive/ask',      name: 'hive-ask',      component: () => import('./pages/HiveAsk.vue'),      meta: { shell: 'hive' } },
    { path: '/hive/ask/:id',  name: 'hive-ask-one',  component: () => import('./pages/HiveAskDetail.vue'), meta: { shell: 'hive' } },
    { path: '/hive/challenge/:slug', name: 'hive-challenge', component: () => import('./pages/HiveChallenge.vue'), meta: { shell: 'hive' } },
    { path: '/hive/activity', name: 'hive-activity', component: () => import('./pages/HiveActivity.vue'), meta: { shell: 'hive', requiresAuth: true } },
    { path: '/@:handle',      name: 'hive-page',     component: () => import('./pages/HiveProfile.vue'),  meta: { shell: 'hive' } },
    { path: '/faq', name: 'faq', component: () => import('./pages/Faq.vue') },
    { path: '/track', name: 'track', component: () => import('./pages/Track.vue') },
    { path: '/track/:code', name: 'track-code', component: () => import('./pages/Track.vue') },
    { path: '/affiliate',            name: 'affiliate-program', component: () => import('./pages/AffiliateProgram.vue') },
    { path: '/affiliate/apply',      name: 'affiliate-apply',   component: () => import('./pages/AffiliateApply.vue') },
    { path: '/affiliate/shop/:code', name: 'affiliate-shop', component: () => import('./pages/AffiliateShop.vue') },
    { path: '/affiliate/:code/dashboard', name: 'affiliate-dashboard', component: () => import('./pages/AffiliateDashboard.vue') },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./pages/NotFound.vue') },
];

const router = createRouter({
    history: createWebHistory(),
    routes,
    /**
     * Restore the previous scroll position when the customer hits Back
     * (Vue Router fills `savedPosition` for popstate navigations).
     * Hash links jump to the anchor. Forward navigations go to top.
     * Wait a beat so the new page has rendered before we scroll.
     */
    scrollBehavior(to, _from, savedPosition) {
        if (savedPosition) {
            return new Promise((resolve) => {
                setTimeout(() => resolve(savedPosition), 60);
            });
        }
        if (to.hash) return { el: to.hash, behavior: 'smooth' };
        return { top: 0 };
    },
});

/**
 * Auth gate for members-only surfaces (Show Room). The answer comes from the
 * shared auth store — the same one the menu reads — so the link and the route
 * can never disagree, and signing out closes the door immediately instead of
 * after a cache expires.
 */
router.beforeEach(async (to) => {
    if (!to.meta.requiresAuth) return true;
    if (await authStore.check()) return true;
    return { path: '/account/login', query: { next: to.fullPath } };
});

export default router;
