<script>
import { api } from '../../lib/api.js';
import { wishlist } from '../wishlist-store.js';

export default {
    name: 'SignupPage',
    data() {
        return {
            first_name: '',
            last_name: '',
            email: '',
            password: '',
            marketing_consent: false,
            submitting: false,
            error: '',
        };
    },
    computed: {
        nextPath() {
            return this.$route.query.next || '/account';
        },
    },
    methods: {
        async submit() {
            this.submitting = true;
            this.error = '';
            try {
                await api.post('/api/account/signup', {
                    first_name: this.first_name || null,
                    last_name:  this.last_name  || null,
                    email:      this.email,
                    password:   this.password,
                    marketing_consent: this.marketing_consent,
                });
                try { await wishlist.boot(); } catch { /* don't block signup */ }
                this.$router.push(this.nextPath);
            } catch (e) {
                this.error = e.payload?.error
                    || (e.payload?.errors && Object.values(e.payload.errors)[0]?.[0])
                    || 'Could not create your account. Please check the fields and try again.';
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
                <p class="font-script text-3xl text-gold">Join us</p>
                <h1 class="font-display text-3xl tracking-widest uppercase">Create Account</h1>
            </div>
            <form @submit.prevent="submit" class="bg-white border border-gold/10 p-8 space-y-4">
                <div class="grid grid-cols-2 gap-3">
                    <input v-model="first_name" type="text" placeholder="First name" class="border border-black/15 px-4 py-3" autocomplete="given-name" />
                    <input v-model="last_name"  type="text" placeholder="Last name"  class="border border-black/15 px-4 py-3" autocomplete="family-name" />
                </div>
                <input v-model="email" type="email" placeholder="Email" required class="w-full border border-black/15 px-4 py-3" autocomplete="email" />
                <input v-model="password" type="password" placeholder="Password (8+ characters)" required minlength="8" class="w-full border border-black/15 px-4 py-3" autocomplete="new-password" />
                <label class="flex items-center gap-2 text-xs text-black/60">
                    <input type="checkbox" v-model="marketing_consent" />
                    Send me drop alerts and offers (optional)
                </label>
                <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
                <button type="submit" :disabled="submitting" class="w-full bg-gold text-white py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-50">
                    {{ submitting ? 'Creating account…' : 'Create Account' }}
                </button>

                <div class="flex items-center gap-3 text-[10px] tracking-widest uppercase text-black/40">
                    <span class="flex-1 h-px bg-black/10"></span>
                    <span>or</span>
                    <span class="flex-1 h-px bg-black/10"></span>
                </div>

                <a
                    href="/api/account/oauth/google"
                    class="block w-full text-center border border-black/15 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:border-gold hover:text-gold transition-colors"
                >
                    Continue with Google
                </a>

                <p class="text-center text-xs text-black/60">
                    Already have an account?
                    <router-link to="/account/login" class="text-gold underline">Sign in</router-link>
                </p>
            </form>
        </div>
    </div>
</template>
