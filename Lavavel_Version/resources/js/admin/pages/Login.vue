<script>
export default {
    name: 'AdminLogin',
    data() {
        return { email: '', password: '', submitting: false, error: '' };
    },
    methods: {
        submit() {
            this.submitting = true;
            setTimeout(() => {
                this.submitting = false;
                this.error = 'Admin auth lands in Milestone 6.';
            }, 400);
        },
    },
};
</script>

<template>
    <div class="min-h-screen flex items-center justify-center px-4 bg-black">
        <div class="w-full max-w-md bg-white p-8 border-t-4 border-gold">
            <img src="/logo.png" alt="BLESSLUXE" class="h-10 mx-auto mb-2" />
            <p class="text-center text-[10px] tracking-[0.3em] uppercase text-gold mb-6">Admin · Sign In</p>
            <form @submit.prevent="submit" class="space-y-3">
                <input v-model="email" type="email" placeholder="Email" required class="w-full border border-zinc-300 px-4 py-3" />
                <input v-model="password" type="password" placeholder="Password" required class="w-full border border-zinc-300 px-4 py-3" />
                <p v-if="error" class="text-sm text-red-600">{{ error }}</p>
                <button type="submit" :disabled="submitting" class="w-full bg-gold text-white py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors disabled:opacity-50">
                    {{ submitting ? 'Signing in…' : 'Sign In' }}
                </button>
            </form>
            <p class="text-center text-xs text-zinc-500 mt-6">
                <router-link to="/admin" class="hover:text-gold">← back to dashboard preview</router-link>
            </p>
        </div>
    </div>
</template>
