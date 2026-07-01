<script>
import { api } from '../../lib/api.js';

export default {
    name: 'ResetPasswordPage',
    data() {
        return {
            email: this.$route.query.email || '',
            password: '',
            confirm: '',
            submitting: false,
            done: false,
            error: '',
        };
    },
    computed: {
        token() { return this.$route.params.token; },
        passwordMismatch() { return this.password && this.confirm && this.password !== this.confirm; },
    },
    methods: {
        async submit() {
            if (this.passwordMismatch) {
                this.error = "Passwords don't match.";
                return;
            }
            this.submitting = true;
            this.error = '';
            try {
                await api.post('/api/account/reset-password', {
                    email: this.email,
                    token: this.token,
                    password: this.password,
                });
                this.done = true;
                setTimeout(() => this.$router.push('/account'), 1500);
            } catch (e) {
                this.error = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not reset password.';
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
                <p class="font-script text-3xl text-gold">Set new</p>
                <h1 class="font-display text-3xl tracking-widest uppercase">Reset Password</h1>
            </div>
            <div v-if="done" class="bg-white border border-gold/10 p-8 text-center">
                <p class="font-display text-xl tracking-widest uppercase mb-2">Password updated</p>
                <p class="text-sm text-black/65">Redirecting you to your account…</p>
            </div>
            <form v-else @submit.prevent="submit" class="bg-white border border-gold/10 p-8 space-y-4">
                <input v-model="email" type="email" placeholder="Email" required autocomplete="email" class="w-full border border-black/15 px-4 py-3" />
                <input v-model="password" type="password" placeholder="New password (min 8 chars)" required minlength="8" autocomplete="new-password" class="w-full border border-black/15 px-4 py-3" />
                <input v-model="confirm" type="password" placeholder="Confirm new password" required minlength="8" autocomplete="new-password" class="w-full border border-black/15 px-4 py-3" />
                <p v-if="passwordMismatch" class="text-xs text-red-600">Passwords don't match.</p>
                <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
                <button
                    type="submit"
                    :disabled="submitting"
                    class="w-full bg-gold text-white py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-50"
                >
                    {{ submitting ? 'Updating…' : 'Update password' }}
                </button>
            </form>
        </div>
    </div>
</template>
