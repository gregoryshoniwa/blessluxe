<script>
import PlaceholderTable from '../components/PlaceholderTable.vue';
export default {
    name: 'AdminReviews',
    components: { PlaceholderTable },
};
</script>

<template>
    <PlaceholderTable
        title="Reviews"
        subtitle="Moderation"
        cta-label="Refresh"
        :columns="['Product','Rating','Customer','Excerpt','Status']"
    />
</template>
