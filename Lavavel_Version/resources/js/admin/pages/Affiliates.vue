<script>
import PlaceholderTable from '../components/PlaceholderTable.vue';
export default {
    name: 'AdminAffiliates',
    components: { PlaceholderTable },
};
</script>

<template>
    <PlaceholderTable
        title="Affiliates"
        subtitle="Partners"
        cta-label="New Affiliate"
        :columns="['Code','Owner','Commission','Earnings','Status']"
    />
</template>
