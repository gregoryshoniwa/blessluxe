<script>
import PlaceholderTable from '../components/PlaceholderTable.vue';
export default {
    name: 'AdminCustomers',
    components: { PlaceholderTable },
};
</script>

<template>
    <PlaceholderTable
        title="Customers"
        subtitle="People"
        cta-label="New Customer"
        :columns="['Name','Email','Orders','Loyalty (Blits)','Joined']"
    />
</template>
