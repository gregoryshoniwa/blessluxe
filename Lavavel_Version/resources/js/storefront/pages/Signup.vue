<script>
export default {
    name: 'SignupPage',
    data() {
        return {
            name: '',
            email: '',
            password: '',
        };
    },
    methods: {
        submit() {
            // Milestone 4.
            alert('Signup wires up in Milestone 4.');
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
                <input v-model="name" type="text" placeholder="Name" required class="w-full border border-black/15 px-4 py-3" />
                <input v-model="email" type="email" placeholder="Email" required class="w-full border border-black/15 px-4 py-3" />
                <input v-model="password" type="password" placeholder="Password (8+ characters)" required class="w-full border border-black/15 px-4 py-3" />
                <button type="submit" class="w-full bg-gold text-white py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                    Create Account
                </button>
                <p class="text-center text-xs text-black/60">
                    Already have an account?
                    <router-link to="/account/login" class="text-gold underline">Sign in</router-link>
                </p>
            </form>
        </div>
    </div>
</template>
