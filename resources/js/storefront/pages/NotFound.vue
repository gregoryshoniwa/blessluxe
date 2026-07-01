<script>
export default {
    name: 'NotFoundPage',
};
</script>

<template>
    <div class="min-h-[60vh] flex items-center justify-center px-[5%]">
        <div class="text-center">
            <p class="font-script text-3xl text-gold">404</p>
            <h1 class="font-display text-3xl md:text-4xl tracking-widest uppercase mb-2">Page Not Found</h1>
            <p class="text-sm text-black/65 mb-8">The page you're looking for isn't here.</p>
            <router-link to="/" class="inline-block bg-gold text-white px-8 py-3 text-xs font-semibold tracking-[0.3em] uppercase hover:bg-gold-dark transition-colors">
                Back to Home
            </router-link>
        </div>
    </div>
</template>
