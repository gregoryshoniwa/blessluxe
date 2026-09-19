<script>
import { ExternalLink } from 'lucide-vue-next';

export default {
    name: 'TrackingSummary',
    components: { ExternalLink },
    props: {
        shipment: { type: Object, required: true },
    },
    computed: {
        // An estimate is rendered as a WINDOW and labelled as an estimate. A
        // fake-precise date that turns out wrong costs more in support contact
        // than showing no date at all.
        etaText() {
            const e = this.shipment.estimated_delivery;
            if (!e) return null;
            if (!e.is_estimate && e.at) return this.fmtDay(e.at);
            if (e.from && e.to) return `${this.fmtDay(e.from)} – ${this.fmtDay(e.to)}`;
            return null;
        },
        etaIsEstimate() { return !!this.shipment.estimated_delivery?.is_estimate; },
    },
    methods: {
        fmtDay(iso) {
            return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—';
        },
    },
};
</script>

<template>
    <dl class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div>
            <dt class="text-[10px] tracking-widest uppercase text-black/55">Tracking code</dt>
            <dd class="font-mono text-gold-dark">{{ shipment.code }}</dd>
        </div>

        <div>
            <dt class="text-[10px] tracking-widest uppercase text-black/55">Carrier</dt>
            <dd>{{ shipment.carrier_label || '—' }}</dd>
        </div>

        <div>
            <dt class="text-[10px] tracking-widest uppercase text-black/55">Carrier reference</dt>
            <dd>
                <!-- Customers expect to click a tracking number, not copy it. -->
                <a
                    v-if="shipment.carrier_tracking_url"
                    :href="shipment.carrier_tracking_url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="font-mono text-xs text-gold-dark underline hover:text-gold inline-flex items-center gap-1"
                >
                    {{ shipment.carrier_tracking_number }}
                    <ExternalLink class="w-3 h-3" />
                </a>
                <span v-else class="font-mono text-xs">{{ shipment.carrier_tracking_number || '—' }}</span>
            </dd>
        </div>

        <div>
            <dt class="text-[10px] tracking-widest uppercase text-black/55">
                {{ etaIsEstimate ? 'Estimated delivery' : 'Delivery' }}
            </dt>
            <dd>
                <span v-if="etaText">{{ etaText }}</span>
                <span v-else class="text-black/45">We'll update this once it's moving</span>
            </dd>
        </div>

        <div v-if="shipment.current_location" class="col-span-2 md:col-span-4">
            <dt class="text-[10px] tracking-widest uppercase text-black/55">Last seen</dt>
            <dd>{{ shipment.current_location }}</dd>
        </div>
    </dl>
</template>
