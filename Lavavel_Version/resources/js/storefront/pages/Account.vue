<script>
export default {
    name: 'AccountPage',
    data() {
        return {
            activeTab: 'overview',
            tabs: [
                { id: 'overview',     label: 'Overview' },
                { id: 'transactions', label: 'Transactions' },
                { id: 'addresses',    label: 'Addresses' },
                { id: 'wishlist',     label: 'Wishlist' },
            ],
            customer: { name: 'Guest', email: '' },
        };
    },
    mounted() {
        fetch('/api/account/me')
            .then(r => r.json())
            .then(d => {
                if (d.customer) this.customer = d.customer;
            })
            .catch(() => {});
        const tab = this.$route.query.tab;
        if (tab && this.tabs.some(t => t.id === tab)) this.activeTab = tab;
    },
};
</script>

<template>
    <div class="max-w-[1200px] mx-auto px-[5%] py-12">
        <div class="mb-10">
            <p class="font-script text-3xl text-gold">Welcome</p>
            <h1 class="font-display text-3xl md:text-4xl tracking-widest uppercase">My Account</h1>
        </div>

        <div class="grid grid-cols-12 gap-8">
            <aside class="col-span-12 md:col-span-3 space-y-1">
                <button
                    v-for="t in tabs"
                    :key="t.id"
                    @click="activeTab = t.id"
                    :class="[
                        'w-full text-left px-4 py-3 text-sm tracking-widest uppercase',
                        activeTab === t.id ? 'bg-gold text-white' : 'text-black/70 hover:bg-cream-dark',
                    ]"
                >
                    {{ t.label }}
                </button>
                <router-link to="/account/login" class="block px-4 py-3 text-sm text-black/55 mt-6 hover:text-gold">Sign in / Sign out</router-link>
            </aside>
            <section class="col-span-12 md:col-span-9 bg-white border border-gold/10 p-6">
                <div v-if="activeTab === 'overview'">
                    <h2 class="font-display text-xl tracking-widest uppercase mb-2">Overview</h2>
                    <p class="text-sm text-black/65">Signed in as {{ customer.email || 'guest' }}.</p>
                </div>
                <div v-else-if="activeTab === 'transactions'">
                    <h2 class="font-display text-xl tracking-widest uppercase mb-2">Transactions</h2>
                    <p class="text-sm text-black/65">No orders yet.</p>
                </div>
                <div v-else-if="activeTab === 'addresses'">
                    <h2 class="font-display text-xl tracking-widest uppercase mb-2">Addresses</h2>
                    <p class="text-sm text-black/65">Add an address at checkout.</p>
                </div>
                <div v-else-if="activeTab === 'wishlist'">
                    <h2 class="font-display text-xl tracking-widest uppercase mb-2">Wishlist</h2>
                    <p class="text-sm text-black/65">
                        <router-link to="/wishlist" class="text-gold underline">View full wishlist →</router-link>
                    </p>
                </div>
            </section>
        </div>
    </div>
</template>
