<script>
import { api } from '../../lib/api.js';

export default {
    name: 'LoginPage',
    data() {
        return {
            email: '',
            password: '',
            remember: true,
            submitting: false,
            error: '',
        };
    },
    computed: {
        nextPath() {
            return this.$route.query.next || '/account';
        },
        googleHref() {
            return `/api/account/oauth/google?next=${encodeURIComponent(this.nextPath)}`;
        },
    },
    methods: {
        async submit() {
            this.submitting = true;
            this.error = '';
            try {
                await api.post('/api/account/login', {
                    email: this.email,
                    password: this.password,
                    remember: this.remember,
                });
                this.$router.push(this.nextPath);
            } catch (e) {
                this.error = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Sign-in failed. Check your email and password.';
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
                <p class="font-script text-3xl text-gold">Welcome back</p>
                <h1 class="font-display text-3xl tracking-widest uppercase">Sign In</h1>
            </div>
            <form @submit.prevent="submit" class="bg-white border border-gold/10 p-8 space-y-4">
                <input v-model="email" type="email" placeholder="Email" required class="w-full border border-black/15 px-4 py-3" autocomplete="email" />
                <input v-model="password" type="password" placeholder="Password" required class="w-full border border-black/15 px-4 py-3" autocomplete="current-password" />
                <label class="flex items-center gap-2 text-xs text-black/60">
                    <input type="checkbox" v-model="remember" /> Remember me on this device
                </label>
                <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
                <button
                    type="submit"
                    :disabled="submitting"
                    class="w-full bg-gold text-white py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-50"
                >
                    {{ submitting ? 'Signing in…' : 'Sign In' }}
                </button>

                <div class="flex items-center gap-3 text-[10px] tracking-widest uppercase text-black/40">
                    <span class="flex-1 h-px bg-black/10"></span>
                    <span>or</span>
                    <span class="flex-1 h-px bg-black/10"></span>
                </div>

                <a
                    :href="googleHref"
                    class="block w-full text-center border border-black/15 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:border-gold hover:text-gold transition-colors"
                >
                    Continue with Google
                </a>

                <p class="text-center text-xs text-black/60">
                    No account?
                    <router-link :to="`/account/signup?next=${encodeURIComponent(nextPath)}`" class="text-gold underline">Create one</router-link>
                </p>
            </form>
        </div>
    </div>
</template>
