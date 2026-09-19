<?php

namespace App\Enums;

/**
 * The lifecycle of ONE buyer's piece inside a pack consignment — distinct from
 * PackageStatus, which describes a whole package.
 *
 * Packs ship in two legs: the consignment travels to BLESSLUXE (leg 1), then each
 * buyer either collects their piece or pays to have it forwarded (leg 2). A single
 * package status cannot express that, because five buyers share one leg-1 package
 * and then diverge.
 *
 * Stored in package_items.status, which already existed with a 'pending' default.
 */
enum PieceStatus: string
{
    case Pending                = 'pending';
    case InConsignment          = 'in_consignment';
    case AtAdmin                = 'at_admin';
    case ReadyForCollection     = 'ready_for_collection';
    case AwaitingForwardPayment = 'awaiting_forward_payment';
    case Forwarding             = 'forwarding';
    case Collected              = 'collected';
    case Forwarded              = 'forwarded';
    case Cancelled              = 'cancelled';

    public function label(): string
    {
        return match ($this) {
            self::Pending                => 'Reserved',
            self::InConsignment          => 'On its way to BLESSLUXE',
            self::AtAdmin                => 'At BLESSLUXE',
            self::ReadyForCollection     => 'Ready to collect',
            self::AwaitingForwardPayment => 'Awaiting forwarding payment',
            self::Forwarding             => 'Forwarding to you',
            self::Collected              => 'Collected',
            self::Forwarded              => 'Delivered',
            self::Cancelled              => 'Withdrawn',
        };
    }

    /** The piece has left BLESSLUXE's custody, one way or the other. */
    public function isTerminal(): bool
    {
        return in_array($this, [self::Collected, self::Forwarded, self::Cancelled], true);
    }

    /** Buyer still has a decision or a payment outstanding. */
    public function needsBuyerAction(): bool
    {
        return in_array($this, [self::AtAdmin, self::AwaitingForwardPayment], true);
    }

    /** @return array<int,string> */
    public static function values(): array
    {
        return array_map(fn (self $c) => $c->value, self::cases());
    }
}
