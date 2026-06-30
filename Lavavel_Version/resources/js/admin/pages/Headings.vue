<script>
import PlaceholderTable from '../components/PlaceholderTable.vue';
export default {
    name: 'AdminHeadings',
    components: { PlaceholderTable },
};
</script>

<template>
    <PlaceholderTable
        title="Headings"
        subtitle="Navigation"
        cta-label="New Heading"
        :columns="['Heading','Catalogues','Active','Sale','Order']"
    />
</template>
