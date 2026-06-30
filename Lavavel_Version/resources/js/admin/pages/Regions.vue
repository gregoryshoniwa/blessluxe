<script>
import PlaceholderTable from '../components/PlaceholderTable.vue';
export default {
    name: 'AdminRegions',
    components: { PlaceholderTable },
};
</script>

<template>
    <PlaceholderTable
        title="Regions"
        subtitle="Geography"
        cta-label="New Region"
        :columns="['Region','Currency','Tax','Active']"
    />
</template>
