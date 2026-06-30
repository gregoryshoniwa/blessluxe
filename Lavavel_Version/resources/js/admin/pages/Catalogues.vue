<script>
import PlaceholderTable from '../components/PlaceholderTable.vue';
export default {
    name: 'AdminCatalogues',
    components: { PlaceholderTable },
};
</script>

<template>
    <PlaceholderTable
        title="Catalogues"
        subtitle="Navigation"
        cta-label="New Catalogue"
        :columns="['Catalogue','Heading','Products','Order']"
    />
</template>
