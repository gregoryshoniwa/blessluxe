<script>
export default { name: 'AdminNotFound' };
</script>

<template>
    <div class="text-center py-16">
        <p class="text-xs tracking-widest uppercase text-zinc-500">404</p>
        <h1 class="text-2xl font-semibold mb-2">Admin page not found</h1>
        <router-link to="/admin" class="text-gold underline">Back to dashboard</router-link>
    </div>
</template>
