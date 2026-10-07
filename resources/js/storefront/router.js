import { resetCrumbs } from './crumbs.js';
import { createRouter, createWebHistory } from 'vue-router';
import { busy } from '../lib/smooth.js';
import { authStore } from './auth-store.js';

const routes = [
    { path: '/', name: 'home', component: () => import('./pages/Home.vue'), meta: { crumbs: false } },
    { path: '/shop', name: 'shop', component: () => import('./pages/Shop.vue'), meta: { crumbsWidth: 'max-w-[1600px] px-[5%]', crumbs: [{ label: 'Shop' }] } },
    { path: '/shop/series', name: 'series', component: () => import('./pages/Packs.vue'), meta: { crumbs: [{ label: 'Series' }] } },
    { path: '/shop/series/:code', name: 'series-campaign', component: () => import('./pages/PackCampaign.vue'), meta: { crumbs: [{ label: 'Series', to: '/shop/series' }] } },
    // A group-buy was called a "pack" until shoppers told us they call it a
    // series. Links to the old address are already shared, so they redirect.
    { path: '/shop/series', redirect: '/shop/series' },
    { path: '/shop/series/:code', redirect: (to) => `/shop/series/${to.params.code}` },
    { path: '/shop/:handle', name: 'product', component: () => import('./pages/ProductDetail.vue'), meta: { crumbs: [{ label: 'Shop', to: '/shop' }] } },
    { path: '/cart', name: 'cart', component: () => import('./pages/Cart.vue'), meta: { crumbsWidth: 'max-w-7xl px-4 sm:px-6 lg:px-8', crumbs: [{ label: 'Bag' }] } },
    { path: '/wishlist', name: 'wishlist', component: () => import('./pages/Wishlist.vue'), meta: { crumbs: [{ label: 'Wishlist' }] } },
    { path: '/checkout', name: 'checkout-info', component: () => import('./pages/CheckoutInfo.vue'), meta: { crumbs: false } },
    { path: '/checkout/shipping', name: 'checkout-shipping', component: () => import('./pages/CheckoutShipping.vue'), meta: { crumbs: false } },
    { path: '/checkout/payment', name: 'checkout-payment', component: () => import('./pages/CheckoutPayment.vue'), meta: { crumbs: false } },
    { path: '/checkout/confirmation', name: 'checkout-confirmation', component: () => import('./pages/CheckoutConfirmation.vue'), meta: { crumbs: false } },
    { path: '/checkout/return', name: 'payment-return', component: () => import('./pages/PaymentReturn.vue'), meta: { crumbs: false } },
    // Old Paynow-shaped path: Paynow's dashboard and stale bundles still send people here.
    { path: '/checkout/paynow/return', name: 'paynow-return', component: () => import('./pages/PaymentReturn.vue'), meta: { crumbs: false } },
    { path: '/account', name: 'account', component: () => import('./pages/Account.vue'), meta: { crumbsWidth: 'max-w-[1200px] px-[5%]', crumbs: [{ label: 'My account' }] } },
    { path: '/account/login', name: 'login', component: () => import('./pages/Login.vue'), meta: { crumbsWidth: 'max-w-md px-[5%] sm:px-0', crumbs: [{ label: 'Sign in' }] } },
    { path: '/account/signup', name: 'signup', component: () => import('./pages/Signup.vue'), meta: { crumbsWidth: 'max-w-md px-[5%] sm:px-0', crumbs: [{ label: 'Sign in', to: '/account/login' }, { label: 'Create account' }] } },
    { path: '/account/forgot', name: 'forgot-password', component: () => import('./pages/ForgotPassword.vue'), meta: { crumbsWidth: 'max-w-md px-[5%] sm:px-0', crumbs: [{ label: 'Sign in', to: '/account/login' }, { label: 'Forgot password' }] } },
    { path: '/account/reset/:token', name: 'reset-password', component: () => import('./pages/ResetPassword.vue'), meta: { crumbsWidth: 'max-w-md px-[5%] sm:px-0', crumbs: [{ label: 'Sign in', to: '/account/login' }, { label: 'New password' }] } },
    { path: '/account/orders/:number', name: 'order-detail', component: () => import('./pages/OrderDetail.vue'), meta: { crumbsWidth: 'max-w-[1100px] px-[5%]', crumbs: (r) => [{ label: 'My account', to: '/account' }, { label: 'Orders', to: '/account?tab=transactions' }, { label: `Order ${r.params.number}` }] } },
    { path: '/showroom/:tab?', name: 'showroom', component: () => import('./pages/ShowRoom.vue'), meta: { crumbsWidth: 'w-full px-4 md:px-8', crumbs: [{ label: 'Show Room' }], requiresAuth: true } },
    // Bless Hive — the community. Open to read; acting needs an account.
    // `shell: 'hive'` swaps the shop's chrome for the Hive's own frame (App.vue).
    { path: '/hive',          name: 'hive',          component: () => import('./pages/Hive.vue'),         meta: { shell: 'hive' } },
    { path: '/hive/discover', name: 'hive-discover', component: () => import('./pages/HiveDiscover.vue'), meta: { shell: 'hive' } },
    { path: '/hive/ask',      name: 'hive-ask',      component: () => import('./pages/HiveAsk.vue'),      meta: { shell: 'hive' } },
    { path: '/hive/ask/:id',  name: 'hive-ask-one',  component: () => import('./pages/HiveAskDetail.vue'), meta: { shell: 'hive' } },
    { path: '/hive/live',     name: 'hive-lives',     component: () => import('./pages/HiveLives.vue'),    meta: { shell: 'hive' } },
    { path: '/hive/live/:id', name: 'hive-live-room', component: () => import('./pages/HiveLiveRoom.vue'), meta: { shell: 'hive' } },
    { path: '/hive/challenge/:slug', name: 'hive-challenge', component: () => import('./pages/HiveChallenge.vue'), meta: { shell: 'hive' } },
    { path: '/hive/activity', name: 'hive-activity', component: () => import('./pages/HiveActivity.vue'), meta: { shell: 'hive', requiresAuth: true } },
    { path: '/@:handle',      name: 'hive-page',     component: () => import('./pages/HiveProfile.vue'),  meta: { shell: 'hive' } },
    { path: '/help/returns', name: 'returns', component: () => import('./pages/Returns.vue'), meta: { crumbsWidth: 'max-w-3xl px-[5%]', crumbs: [{ label: 'Returns' }] } },
    { path: '/contact', name: 'contact', component: () => import('./pages/Contact.vue'), meta: { crumbsWidth: 'max-w-3xl px-[5%]', crumbs: [{ label: 'Contact' }] } },
    { path: '/terms', name: 'terms', component: () => import('./pages/Terms.vue'), meta: { crumbsWidth: 'max-w-3xl px-[5%]', crumbs: [{ label: 'Terms' }] } },
    { path: '/faq', name: 'faq', component: () => import('./pages/Faq.vue'), meta: { crumbsWidth: 'max-w-[900px] px-[5%]', crumbs: [{ label: 'FAQ' }] } },
    { path: '/track', name: 'track', component: () => import('./pages/Track.vue'), meta: { crumbsWidth: 'max-w-[900px] px-[5%]', crumbs: [{ label: 'Track an order' }] } },
    { path: '/track/:code', name: 'track-code', component: () => import('./pages/Track.vue'), meta: { crumbsWidth: 'max-w-[900px] px-[5%]', crumbs: (r) => [{ label: 'Track an order', to: '/track' }, { label: r.params.code }] } },
    { path: '/affiliate',            name: 'affiliate-program', component: () => import('./pages/AffiliateProgram.vue'), meta: { crumbsWidth: 'max-w-[1200px] px-[5%]', crumbs: [{ label: 'Affiliates' }] } },
    { path: '/affiliate/apply',      name: 'affiliate-apply',   component: () => import('./pages/AffiliateApply.vue'), meta: { crumbsWidth: 'max-w-[700px] px-[5%]', crumbs: [{ label: 'Affiliates', to: '/affiliate' }, { label: 'Apply' }] } },
    { path: '/affiliate/shop/:code', name: 'affiliate-shop', component: () => import('./pages/AffiliateShop.vue'), meta: { crumbs: false } },
    { path: '/affiliate/:code/dashboard', name: 'affiliate-dashboard', component: () => import('./pages/AffiliateDashboard.vue'), meta: { crumbsWidth: 'max-w-[1200px] px-[5%]', crumbs: [{ label: 'Affiliates', to: '/affiliate' }, { label: 'Dashboard' }] } },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: () => import('./pages/NotFound.vue'), meta: { crumbs: false } },
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
    scrollBehavior(to, from, savedPosition) {
        // A filter, sort or search is the same page with a new question. Jumping
        // to the top on every tap was half of what made filtering feel like a cut.
        if (from && to.path === from.path && !to.hash) return false;
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

// The progress line runs while a page's code is fetched and its guards resolve.
let pageDone = null;
router.beforeEach((to, from) => {
    if (to.path !== from.path) { pageDone?.(); pageDone = busy(); }
});
router.afterEach(() => { pageDone?.(); pageDone = null; });

// A new page starts with its route's own trail; a page that knows better replaces it.
router.afterEach((to, from) => { if (to.path !== from.path) resetCrumbs(to); });
router.onError(() => { pageDone?.(); pageDone = null; });

export default router;
