// Mirror of app/Enums/PackageStatus.php.
//
// This list previously existed in four places (a PHP validation rule and three
// hand-maintained Vue maps) and had already drifted — the Vue copy sent `returned`
// and `cancelled` to progress step 4, painting a full "delivered" bar over a parcel
// that never arrived.
//
// tests/Unit/PackageStatusParityTest.php reads this file and asserts it matches the
// PHP enum, so editing one without the other fails the suite.

export const PACKAGE_STATUSES = [
    { value: 'created',          label: 'Order received',        progressIndex: 0,    isFailure: false, icon: 'package' },
    { value: 'sourcing',         label: 'Sourcing from supplier', progressIndex: 0,   isFailure: false, icon: 'package' },
    { value: 'picked',           label: 'Picked',                progressIndex: 1,    isFailure: false, icon: 'package' },
    { value: 'packed',           label: 'Packed',                progressIndex: 1,    isFailure: false, icon: 'package' },
    { value: 'shipped',          label: 'Shipped',               progressIndex: 2,    isFailure: false, icon: 'truck' },
    { value: 'in_transit',       label: 'In transit',            progressIndex: 2,    isFailure: false, icon: 'truck' },
    { value: 'at_courier',       label: 'Landed at courier',     progressIndex: 3,    isFailure: false, icon: 'truck' },
    { value: 'out_for_delivery', label: 'Out for delivery',      progressIndex: 3,    isFailure: false, icon: 'truck' },
    { value: 'delivered',        label: 'Delivered',             progressIndex: 4,    isFailure: false, icon: 'check' },
    { value: 'returned',         label: 'Returned',              progressIndex: null, isFailure: true,  icon: 'x' },
    { value: 'cancelled',        label: 'Cancelled',             progressIndex: null, isFailure: true,  icon: 'x' },
];

/** The five milestones a healthy parcel passes through. */
export const PROGRESS_STEPS = ['Received', 'Packed', 'Shipped', 'Out for delivery', 'Delivered'];

// Pack goods travel supplier (Turkey/China) -> courier -> BLESSLUXE -> buyer, so a
// pack buyer's milestones are not a normal parcel's.
export const PACK_COLLECT_STEPS = ['Reserved', 'Ordered', 'In transit', 'At BLESSLUXE', 'Collected'];
export const PACK_FORWARD_STEPS = ['Reserved', 'Ordered', 'In transit', 'At BLESSLUXE', 'On its way', 'Delivered'];

const BY_VALUE = Object.fromEntries(PACKAGE_STATUSES.map((s) => [s.value, s]));

export function statusLabel(status) {
    return BY_VALUE[status]?.label || status || '—';
}

/** null for a failure — callers must render those differently, never as a full bar. */
export function progressIndex(status) {
    const s = BY_VALUE[status];
    return s ? s.progressIndex : 0;
}

export function isFailure(status) {
    return BY_VALUE[status]?.isFailure ?? false;
}

export function iconKey(status) {
    return BY_VALUE[status]?.icon || 'package';
}

/** For admin <select> elements. */
export function statusOptions() {
    return PACKAGE_STATUSES.map(({ value, label }) => ({ value, label }));
}
