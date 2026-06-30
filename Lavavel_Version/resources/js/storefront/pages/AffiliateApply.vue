<script>
import { api } from '../../lib/api.js';
import { ArrowRight, CheckCircle2 } from 'lucide-vue-next';

export default {
    name: 'AffiliateApply',
    components: { ArrowRight, CheckCircle2 },
    data() {
        return {
            form: { first_name: '', last_name: '', email: '', desired_code: '', audience: '', social: '' },
            submitting: false,
            error: '',
            success: null,
        };
    },
    methods: {
        async submit() {
            this.submitting = true;
            this.error = '';
            this.success = null;
            try {
                const d = await api.post('/api/store/affiliate/apply', this.form);
                this.success = d.affiliate;
            } catch (e) {
                this.error = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not submit your application.';
            } finally { this.submitting = false; }
        },
    },
};
</script>

<template>
    <div class="max-w-[700px] mx-auto px-[5%] py-12 min-h-[60vh]">
        <header class="text-center mb-10">
            <p class="font-script text-3xl text-gold">Affiliate</p>
            <h1 class="font-display text-3xl md:text-4xl tracking-widest uppercase">Apply</h1>
        </header>

        <div v-if="success" class="text-center bg-emerald-50 border border-emerald-200 p-8">
            <CheckCircle2 class="w-12 h-12 mx-auto text-emerald-600 mb-4" />
            <h2 class="font-display text-2xl mb-3">Application received</h2>
            <p class="text-sm text-black/65 mb-4">
                Thank you, {{ form.first_name }}. We'll review your application within a couple of business days
                and email you at <strong>{{ success.email }}</strong>.
            </p>
            <p class="text-sm text-black/65">
                We've reserved the code <span class="font-mono font-semibold text-gold-dark">{{ success.code }}</span> for you.
            </p>
            <router-link to="/shop" class="inline-block mt-6 bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                Continue shopping
            </router-link>
        </div>

        <form v-else @submit.prevent="submit" class="bg-white border border-gold/15 p-8 space-y-4">
            <p class="text-xs text-black/65 mb-4">
                We review every application by hand — usually within 1–2 business days.
                Once approved, you'll get a dashboard, a shareable link, and 10% on every sale.
            </p>
            <div class="grid grid-cols-2 gap-3">
                <input v-model="form.first_name" type="text" placeholder="First name" required autocomplete="given-name" class="border border-black/15 px-4 py-3" />
                <input v-model="form.last_name" type="text" placeholder="Last name" autocomplete="family-name" class="border border-black/15 px-4 py-3" />
            </div>
            <input v-model="form.email" type="email" placeholder="Email — we'll write here once approved" required autocomplete="email" class="w-full border border-black/15 px-4 py-3" />
            <div>
                <input v-model="form.desired_code" type="text" placeholder="Preferred code (optional, e.g. JANE10)" maxlength="60" class="w-full border border-black/15 px-4 py-3 font-mono uppercase tracking-wider" />
                <p class="text-[10px] tracking-widest uppercase text-black/45 mt-1">Letters, numbers and dashes only. We'll add a number if it's taken.</p>
            </div>
            <textarea v-model="form.audience" placeholder="Tell us about your audience (size, where they live, what they buy)" rows="3" class="w-full border border-black/15 px-4 py-3"></textarea>
            <input v-model="form.social" type="text" placeholder="Instagram, TikTok, or main link" class="w-full border border-black/15 px-4 py-3" />

            <p v-if="error" class="text-sm text-red-600">{{ error }}</p>

            <button
                type="submit"
                :disabled="submitting"
                class="w-full bg-gold text-white py-4 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
                {{ submitting ? 'Submitting…' : 'Submit application' }}
                <ArrowRight v-if="!submitting" class="w-4 h-4" />
            </button>
        </form>
    </div>
</template>
