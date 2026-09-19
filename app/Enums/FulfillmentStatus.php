<?php

namespace App\Enums;

/**
 * Order-level fulfilment, separate from payment (Shopify's split: an order can be
 * paid and unfulfilled, or fulfilled and refunded — one column cannot say both).
 *
 * Always DERIVED from the order's packages by Shipping::syncOrderFulfillment().
 * Never set by hand from a controller.
 */
enum FulfillmentStatus: string
{
    case Unfulfilled        = 'unfulfilled';
    case AwaitingPack       = 'awaiting_pack';
    case InProgress         = 'in_progress';
    case PartiallyShipped   = 'partially_shipped';
    case Shipped            = 'shipped';
    case AtHub              = 'at_hub';
    case ReadyForCollection = 'ready_for_collection';
    case Delivered          = 'delivered';
    case Collected          = 'collected';
    case Returned           = 'returned';
    case Cancelled          = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Unfulfilled        => 'Unfulfilled',
            self::AwaitingPack       => 'Waiting for pack to fill',
            self::InProgress         => 'Being prepared',
            self::PartiallyShipped   => 'Partially shipped',
            self::Shipped            => 'Shipped',
            self::AtHub              => 'At BLESSLUXE',
            self::ReadyForCollection => 'Ready to collect',
            self::Delivered          => 'Delivered',
            self::Collected          => 'Collected',
            self::Returned           => 'Returned',
            self::Cancelled          => 'Cancelled',
        };
    }

    /**
     * Ordering for collapsing several packages into one order-level status:
     * the order is only as far along as its least-advanced package.
     * Failures sit outside the scale.
     */
    public function rank(): int
    {
        return match ($this) {
            self::Unfulfilled        => 0,
            self::AwaitingPack       => 1,
            self::InProgress         => 2,
            self::PartiallyShipped   => 3,
            self::Shipped            => 4,
            self::AtHub              => 5,
            self::ReadyForCollection => 6,
            self::Delivered          => 7,
            self::Collected          => 8,
            self::Returned, self::Cancelled => -1,
        };
    }

    public function isFailure(): bool
    {
        return in_array($this, [self::Returned, self::Cancelled], true);
    }

    /** The order-level meaning of a single package sitting at $status. */
    public static function fromPackageStatus(PackageStatus $status): self
    {
        return match ($status) {
            PackageStatus::Created                        => self::Unfulfilled,
            // Admin has paid the courier and the supplier is preparing goods.
            PackageStatus::Sourcing,
            PackageStatus::Picked, PackageStatus::Packed  => self::InProgress,
            PackageStatus::Shipped,
            PackageStatus::InTransit,
            // Landed in Zimbabwe but still with the courier — not ours yet.
            PackageStatus::AtCourier,
            PackageStatus::OutForDelivery                 => self::Shipped,
            PackageStatus::Delivered                      => self::Delivered,
            PackageStatus::Returned                       => self::Returned,
            PackageStatus::Cancelled                      => self::Cancelled,
        };
    }

    /** @return array<int,string> */
    public static function values(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
