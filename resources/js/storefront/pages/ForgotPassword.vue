<script>
import { api } from '../../lib/api.js';

export default {
    name: 'ForgotPasswordPage',
    data() { return { email: '', submitting: false, sent: false, error: '' }; },
    methods: {
        async submit() {
            this.submitting = true;
            this.error = '';
            try {
                await api.post('/api/account/forgot-password', { email: this.email });
                this.sent = true;
            } catch (e) {
                this.error = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not send the reset link. Try again in a moment.';
            } finally {
                this.submitting = false;
            }
        },
    },
};
</script>

<template>
    <div class="min-h-[70vh] flex items-center justify-center px-[5%] py-12">
        <div class="w-full max-w-md">
            <div class="text-center mb-8">
                <p class="font-script text-3xl text-gold">Reset</p>
                <h1 class="font-display text-3xl tracking-widest uppercase">Forgot Password</h1>
            </div>
            <div v-if="sent" class="bg-white border border-gold/10 p-8 text-center">
                <p class="font-display text-xl tracking-widest uppercase mb-2">Check your inbox</p>
                <p class="text-sm text-black/65 mb-6">
                    If an account exists for <span class="font-mono">{{ email }}</span>, we've sent a reset link. The link expires in 60 minutes.
                </p>
                <router-link to="/account/login" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                    Back to sign in
                </router-link>
            </div>
            <form v-else @submit.prevent="submit" class="bg-white border border-gold/10 p-8 space-y-4">
                <p class="text-sm text-black/65">Enter your account email and we'll send you a reset link.</p>
                <input v-model="email" type="email" placeholder="Email" required autocomplete="email" class="w-full border border-black/15 px-4 py-3" />
                <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
                <button
                    type="submit"
                    :disabled="submitting"
                    class="w-full bg-gold text-white py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-50"
                >
                    {{ submitting ? 'Sending…' : 'Send reset link' }}
                </button>
                <p class="text-center text-xs">
                    <router-link to="/account/login" class="text-black/55 hover:text-gold transition-colors">← Back to sign in</router-link>
                </p>
            </form>
        </div>
    </div>
</template>
