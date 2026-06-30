<script>
import PlaceholderTable from '../components/PlaceholderTable.vue';
export default {
    name: 'AdminInventory',
    components: { PlaceholderTable },
};
</script>

<template>
    <PlaceholderTable
        title="Inventory"
        subtitle="Stock"
        cta-label="Adjust Stock"
        :columns="['SKU','Product','On hand','Reserved','Threshold']"
    />
</template>
