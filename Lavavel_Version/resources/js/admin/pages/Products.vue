<script>
import PlaceholderTable from '../components/PlaceholderTable.vue';
export default {
    name: 'AdminProducts',
    components: { PlaceholderTable },
};
</script>

<template>
    <PlaceholderTable
        title="Products"
        subtitle="Catalogue"
        cta-label="New Product"
        :columns="['Title','Catalogue','Variants','Status','Updated']"
    />
</template>
