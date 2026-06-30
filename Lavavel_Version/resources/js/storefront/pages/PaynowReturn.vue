<script>
import { api } from '../../lib/api.js';
import { checkoutStore } from '../checkout-store.js';

export default {
    name: 'PaynowReturn',
    data() {
        return {
            state: 'pending',          // pending | paid | failed | cancelled | unknown
            providerStatus: null,
            attempts: 0,
            interval: null,
            cleared: false,
        };
    },
    computed: {
        reference() {
            return this.$route.query.reference || '';
        },
    },
    mounted() {
        if (!this.reference) {
            this.state = 'unknown';
            return;
        }
        this.tick();
        this.interval = setInterval(() => {
            if (['paid', 'failed', 'cancelled'].includes(this.state)) {
                clearInterval(this.interval);
                return;
            }
            this.tick();
        }, 3000);
    },
    beforeUnmount() {
        clearInterval(this.interval);
    },
    methods: {
        async tick() {
            this.attempts += 1;
            try {
                const data = await api.get(`/api/store/payments/paynow/status/${encodeURIComponent(this.reference)}`);
                const s = data.session;
                if (!s) {
                    this.state = 'unknown';
                    return;
                }
                this.state = s.status;
                this.providerStatus = s.provider_status;
                if (s.status === 'paid' && !this.cleared) {
                    this.cleared = true;
                    checkoutStore.clear();
                    window.dispatchEvent(new CustomEvent('blessluxe:cart-updated'));
                    this.$router.replace('/account?tab=transactions');
                }
            } catch {
                // Keep ticking — the network can blip.
            }
        },
    },
};
</script>

<template>
    <div class="min-h-[60vh] flex items-center justify-center px-4 py-12">
        <div class="max-w-md w-full bg-white border border-gold/15 p-8 text-center">
            <template v-if="state === 'paid'">
                <p class="font-script text-3xl text-gold mb-2">Thank you</p>
                <h1 class="font-display text-2xl tracking-widest uppercase mb-2">Payment received</h1>
                <p class="text-sm text-black/65">Redirecting to your account…</p>
            </template>

            <template v-else-if="state === 'failed' || state === 'cancelled'">
                <h1 class="font-display text-2xl tracking-widest uppercase mb-2">Payment {{ state }}</h1>
                <p class="text-sm text-black/65 mb-4">
                    {{ providerStatus ? `Paynow status: ${providerStatus}` : "We couldn't complete this transaction." }}
                </p>
                <router-link to="/cart" class="inline-block bg-gold text-white px-6 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                    Back to cart
                </router-link>
            </template>

            <template v-else-if="state === 'unknown'">
                <h1 class="font-display text-2xl tracking-widest uppercase mb-2">No payment found</h1>
                <p class="text-sm text-black/65 mb-4">
                    We can't find a payment with that reference.
                </p>
                <router-link to="/cart" class="inline-block bg-gold text-white px-6 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                    Back to cart
                </router-link>
            </template>

            <template v-else>
                <p class="font-script text-3xl text-gold mb-2">Just a moment</p>
                <h1 class="font-display text-2xl tracking-widest uppercase mb-2">Confirming payment</h1>
                <p class="text-sm text-black/65">
                    Paynow is finalising your transaction.
                </p>
                <p class="text-[10px] tracking-widest uppercase text-black/40 mt-4">
                    Reference: <span class="font-mono">{{ reference }}</span><span v-if="attempts > 0"> · check {{ attempts }}</span>
                </p>
            </template>
        </div>
    </div>
</template>
