import { createRouter, createWebHistory } from 'vue-router';

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
 * Auth gate for members-only surfaces (Show Room). The check is cached for
 * 30s so switching tabs inside /showroom doesn't refetch on every hop;
 * signing out flips the session cookie, so the short TTL keeps it honest.
 */
let authCache = { signedIn: false, at: 0 };
async function isSignedIn() {
    // Only positive results are cached — a cached "signed out" would bounce
    // freshly logged-in users straight back to the login page.
    if (authCache.signedIn && Date.now() - authCache.at < 30_000) return true;
    try {
        const res = await fetch('/api/account/me', { credentials: 'include', headers: { Accept: 'application/json' } });
        const data = res.ok ? await res.json() : null;
        authCache = { signedIn: !!data?.customer, at: Date.now() };
    } catch {
        authCache = { signedIn: false, at: Date.now() };
    }
    return authCache.signedIn;
}

router.beforeEach(async (to) => {
    if (!to.meta.requiresAuth) return true;
    if (await isSignedIn()) return true;
    return { path: '/account/login', query: { next: to.fullPath } };
});

export default router;
