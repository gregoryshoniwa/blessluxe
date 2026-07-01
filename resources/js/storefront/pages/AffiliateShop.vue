<script>
import { api } from '../../lib/api.js';

export default {
    name: 'AffiliateShop',
    data() {
        return { state: 'resolving', error: '' };
    },
    computed: {
        code() { return (this.$route.params.code || '').toUpperCase(); },
    },
    async mounted() {
        if (!this.code) {
            this.$router.replace('/shop');
            return;
        }
        try {
            await api.post('/api/store/affiliate/resolve', { code: this.code });
            window.dispatchEvent(new CustomEvent('blessluxe:affiliate-changed'));
            // Tag the destination if the URL carried a product handle hint.
            const handle = this.$route.query.product;
            this.$router.replace(handle ? `/shop/${handle}` : '/shop');
        } catch (e) {
            this.state = 'error';
            this.error = e.payload?.error || 'That affiliate code isn’t valid.';
        }
    },
};
</script>

<template>
    <div class="min-h-[60vh] flex items-center justify-center px-4">
        <div v-if="state === 'resolving'" class="text-center">
            <p class="font-script text-3xl text-gold">Setting things up</p>
            <h1 class="font-display text-2xl tracking-widest uppercase mb-2">Shopping via {{ code }}</h1>
            <p class="text-xs tracking-widest uppercase text-black/55 animate-pulse">One moment…</p>
        </div>
        <div v-else class="max-w-md text-center">
            <p class="font-script text-3xl text-gold">Oops</p>
            <h1 class="font-display text-2xl tracking-widest uppercase mb-2">Affiliate code not active</h1>
            <p class="text-sm text-black/65 mb-6">{{ error }}</p>
            <router-link to="/shop" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                Browse the store
            </router-link>
        </div>
    </div>
</template>
