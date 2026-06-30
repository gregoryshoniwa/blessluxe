<script>
export default {
    name: 'LoginPage',
    data() {
        return {
            email: '',
            password: '',
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
        submit() {
            // Wired up in Milestone 4 (Laravel auth).
            this.submitting = true;
            setTimeout(() => {
                this.submitting = false;
                this.error = 'Auth flow lands in Milestone 4.';
            }, 400);
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
                <input v-model="email" type="email" placeholder="Email" required class="w-full border border-black/15 px-4 py-3" />
                <input v-model="password" type="password" placeholder="Password" required class="w-full border border-black/15 px-4 py-3" />
                <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
                <button
                    type="submit"
                    :disabled="submitting"
                    class="w-full bg-gold text-white py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-50"
                >
                    {{ submitting ? 'Signing in…' : 'Sign In' }}
                </button>
                <p class="text-center text-xs text-black/60">
                    No account?
                    <router-link :to="`/account/signup?next=${encodeURIComponent(nextPath)}`" class="text-gold underline">Create one</router-link>
                </p>
            </form>
        </div>
    </div>
</template>
