<script>
export default {
    name: 'AdminDashboard',
    data() {
        return {
            stats: [
                { label: 'Orders today',    value: '—' },
                { label: 'Revenue (7d)',    value: '—' },
                { label: 'Active customers', value: '—' },
                { label: 'Low-stock SKUs',  value: '—' },
            ],
        };
    },
};
</script>

<template>
    <div>
        <header class="mb-8">
            <p class="text-xs tracking-widest uppercase text-zinc-500">Welcome back</p>
            <h1 class="text-2xl font-semibold">Dashboard</h1>
        </header>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div v-for="s in stats" :key="s.label" class="bg-white border border-zinc-200 p-5">
                <p class="text-xs tracking-widest uppercase text-zinc-500 mb-2">{{ s.label }}</p>
                <p class="text-3xl font-semibold">{{ s.value }}</p>
            </div>
        </div>
        <div class="bg-white border border-zinc-200 p-6">
            <h2 class="font-semibold mb-2">Stats wire up in Milestone 6</h2>
            <p class="text-sm text-zinc-600">
                Once the MySQL schema is in place and the API endpoints are filled in, this
                dashboard will show live orders, revenue, and customer counts pulled from
                Laravel models.
            </p>
        </div>
    </div>
</template>
