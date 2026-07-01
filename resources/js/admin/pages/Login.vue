<script>
import { api } from '../../lib/api.js';

export default {
    name: 'AdminLogin',
    data() {
        return {
            email: '',
            password: '',
            remember: true,
            submitting: false,
            error: '',
        };
    },
    methods: {
        async submit() {
            this.submitting = true;
            this.error = '';
            try {
                await api.post('/api/admin/login', {
                    email: this.email,
                    password: this.password,
                    remember: this.remember,
                });
                window.dispatchEvent(new CustomEvent('blessluxe:admin-signed-in'));
            } catch (e) {
                this.error = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Sign-in failed.';
            } finally {
                this.submitting = false;
            }
        },
    },
};
</script>

<template>
    <main
        class="relative min-h-screen flex items-center justify-center overflow-hidden px-4"
        :style="{
            background:
                'radial-gradient(circle at 20% 20%, var(--color-blush) 0%, transparent 45%), ' +
                'radial-gradient(circle at 80% 80%, color-mix(in srgb, var(--color-gold) 18%, transparent) 0%, transparent 50%), ' +
                'var(--color-cream)',
        }"
    >
        <!-- Decorative gold corner brackets — match the Next.js admin chrome. -->
        <div class="pointer-events-none absolute top-8 left-8 h-12 w-12">
            <span class="absolute top-0 left-0 h-px w-12 bg-gold" />
            <span class="absolute top-0 left-0 h-12 w-px bg-gold" />
        </div>
        <div class="pointer-events-none absolute top-8 right-8 h-12 w-12">
            <span class="absolute top-0 right-0 h-px w-12 bg-gold" />
            <span class="absolute top-0 right-0 h-12 w-px bg-gold" />
        </div>
        <div class="pointer-events-none absolute bottom-8 left-8 h-12 w-12">
            <span class="absolute bottom-0 left-0 h-px w-12 bg-gold" />
            <span class="absolute bottom-0 left-0 h-12 w-px bg-gold" />
        </div>
        <div class="pointer-events-none absolute bottom-8 right-8 h-12 w-12">
            <span class="absolute bottom-0 right-0 h-px w-12 bg-gold" />
            <span class="absolute bottom-0 right-0 h-12 w-px bg-gold" />
        </div>

        <form
            @submit.prevent="submit"
            class="relative w-full max-w-md bg-white px-10 py-12 shadow-xl border border-black/[0.06] login-card"
        >
            <!-- Brand mark -->
            <div class="mb-10 text-center">
                <p class="font-script text-3xl text-gold-dark">Bless</p>
                <h1 class="font-display text-4xl font-medium tracking-[0.3em] text-black">
                    BLESSLUXE
                </h1>
                <div class="mt-4 flex items-center justify-center gap-3">
                    <span class="h-px w-8 bg-gold" />
                    <span class="text-[10px] font-semibold uppercase tracking-[0.32em] text-black/55">
                        Admin Atelier
                    </span>
                    <span class="h-px w-8 bg-gold" />
                </div>
            </div>

            <div class="space-y-5">
                <label class="block">
                    <span class="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.28em] text-black/55">Email</span>
                    <input
                        v-model="email"
                        type="email"
                        required
                        autofocus
                        autocomplete="email"
                        placeholder="you@blessluxe.com"
                        class="w-full border border-black/15 px-4 py-3 bg-cream focus:outline-none focus:border-gold focus:bg-white transition-colors"
                    />
                </label>
                <label class="block">
                    <span class="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.28em] text-black/55">Password</span>
                    <input
                        v-model="password"
                        type="password"
                        required
                        autocomplete="current-password"
                        placeholder="••••••••"
                        class="w-full border border-black/15 px-4 py-3 bg-cream focus:outline-none focus:border-gold focus:bg-white transition-colors"
                    />
                </label>
                <label class="flex items-center gap-2 text-xs text-black/60">
                    <input type="checkbox" v-model="remember" class="accent-gold" />
                    Stay signed in on this device
                </label>

                <div v-if="error" class="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
                    {{ error }}
                </div>

                <button
                    type="submit"
                    :disabled="submitting"
                    class="w-full bg-gold text-white py-3 text-xs font-semibold tracking-[0.32em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-50"
                >
                    {{ submitting ? 'Signing in…' : 'Sign In' }}
                </button>
            </div>

            <p class="mt-8 text-center text-[10px] uppercase tracking-[0.32em] text-black/40">
                Restricted · Authorised personnel only
            </p>
        </form>
    </main>
</template>

<style scoped>
/* Single 1px gold accent on top + the gentle gold-tinted shadow that gives
   the card its signature lift over the cream background. */
.login-card {
    border-radius: 4px;
    box-shadow:
        0 1px 0 var(--color-gold),
        0 25px 60px -20px color-mix(in srgb, var(--color-gold) 35%, transparent);
    animation: fade-up 0.55s ease both;
}
@keyframes fade-up {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
}
</style>
