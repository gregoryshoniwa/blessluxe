<script>
// /checkout/shipping is no longer its own page — the shipping fields live
// on /checkout. Anyone landing here gets bounced back so we don't leave
// dead URLs sitting in old bookmarks/emails.
export default {
    name: 'CheckoutShipping',
    mounted() {
        this.$router.replace('/checkout');
    },
};
</script>

<template>
    <div class="min-h-[40vh] flex items-center justify-center">
        <p class="text-xs tracking-widest uppercase text-black/55 animate-pulse">Redirecting…</p>
    </div>
</template>
