<?php

namespace App\Enums;

/**
 * The lifecycle of a whole package.
 *
 * This list used to exist in four places — a validation rule in
 * AdminPackageController plus three hand-maintained maps in Vue. It lives here
 * now, and resources/js/lib/shipping.js mirrors it under a parity test
 * (tests/Unit/PackageStatusParityTest.php) so the two cannot drift.
 */
enum PackageStatus: string
{
    case Created        = 'created';
    case Sourcing       = 'sourcing';
    case Picked         = 'picked';
    case Packed         = 'packed';
    case Shipped        = 'shipped';
    case InTransit      = 'in_transit';
    case AtCourier      = 'at_courier';
    case OutForDelivery = 'out_for_delivery';
    case Delivered      = 'delivered';
    case Returned       = 'returned';
    case Cancelled      = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Created        => 'Order received',
            self::Sourcing       => 'Sourcing from supplier',
            self::Picked         => 'Picked',
            self::Packed         => 'Packed',
            self::Shipped        => 'Shipped',
            self::InTransit      => 'In transit',
            self::AtCourier      => 'Landed at courier',
            self::OutForDelivery => 'Out for delivery',
            self::Delivered      => 'Delivered',
            self::Returned       => 'Returned',
            self::Cancelled      => 'Cancelled',
        };
    }

    /**
     * Position on the five-step progress bar, or null for a failure.
     *
     * Null is the point: the old Vue map sent `returned` and `cancelled` to step 4,
     * which painted a *complete* gold bar over a parcel that never arrived. A null
     * here forces every caller to render failures differently.
     */
    public function progressIndex(): ?int
    {
        return match ($this) {
            self::Created, self::Sourcing     => 0,
            self::Picked, self::Packed        => 1,
            self::Shipped, self::InTransit    => 2,
            self::AtCourier,
            self::OutForDelivery              => 3,
            self::Delivered                   => 4,
            self::Returned, self::Cancelled   => null,
        };
    }

    public function isFailure(): bool
    {
        return in_array($this, [self::Returned, self::Cancelled], true);
    }

    public function isTerminal(): bool
    {
        return in_array($this, [self::Delivered, self::Returned, self::Cancelled], true);
    }

    /** Whether reaching this status is worth an email. See ShippingNotifier. */
    public function notifiesCustomer(): bool
    {
        return in_array($this, [
            self::Shipped,
            self::OutForDelivery,
            self::Delivered,
            self::Returned,
        ], true);
    }

    /**
     * A key, not a component — keeps this enum free of any Vue/lucide coupling.
     * The JS side maps these onto Package / Truck / CheckCircle2 / XCircle.
     */
    public function iconKey(): string
    {
        return match ($this) {
            self::Created, self::Sourcing, self::Picked, self::Packed => 'package',
            self::Shipped, self::InTransit,
            self::AtCourier, self::OutForDelivery                     => 'truck',
            self::Delivered                                           => 'check',
            self::Returned, self::Cancelled                           => 'x',
        };
    }

    /**
     * Customer-facing wording for a pack consignment.
     *
     * The real journey is supplier (Turkey/China) -> courier -> BLESSLUXE -> buyer,
     * so the generic parcel labels are wrong here: "Delivered" on this leg means
     * BLESSLUXE has the goods, not the customer.
     */
    public function consignmentLabel(): string
    {
        return match ($this) {
            self::Created   => 'Pack opened',
            self::Sourcing  => 'Ordering from the supplier',
            self::Picked, self::Packed => 'Supplier preparing your pieces',
            self::Shipped   => 'Left the supplier',
            self::InTransit => 'In transit to Zimbabwe',
            self::AtCourier => 'Landed — clearing at the courier',
            self::Delivered => 'Received by BLESSLUXE',
            default         => $this->label(),
        };
    }

    /** Statuses that mean goods are physically moving toward us. */
    public function isInbound(): bool
    {
        return in_array($this, [self::Shipped, self::InTransit, self::AtCourier], true);
    }

    /** @return array<int,string> */
    public static function values(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }

    /** Shape consumed by admin <select> and by the JS mirror. */
    public static function options(): array
    {
        return array_map(fn (self $c) => [
            'value'          => $c->value,
            'label'          => $c->label(),
            'progress_index' => $c->progressIndex(),
            'is_failure'     => $c->isFailure(),
            'icon'           => $c->iconKey(),
        ], self::cases());
    }
}
