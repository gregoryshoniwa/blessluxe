<?php

namespace App\Mail;

use App\Enums\PackageStatus;
use App\Models\Package;
use App\Services\Carriers;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * One buyer's shipment update.
 *
 * Constructed with only THAT buyer's pieces. For a pack consignment, several of
 * these go out for one event — one Mailable per recipient, never a shared one with
 * a flag, so a cross-buyer leak would take actively passing the wrong collection
 * rather than forgetting a condition.
 *
 * NOT queued: no queue worker runs in production, so a queued mail would pass
 * locally under `composer dev` and silently never send live.
 */
class ShipmentUpdateMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Package $package,
        public PackageStatus $status,
        public string $orderNumber,
        public array $pieces,
    ) {}

    public function envelope(): Envelope
    {
        $subject = $this->package->is_pack
            ? match ($this->status) {
                PackageStatus::Shipped   => 'Your BLESSLUXE pack has left the supplier',
                PackageStatus::Delivered => 'Your piece has arrived — here is your collection code',
                PackageStatus::Returned  => 'Your BLESSLUXE pack was returned',
                default                  => 'Update on your BLESSLUXE pack',
            }
            : match ($this->status) {
                PackageStatus::Shipped        => "Your BLESSLUXE order {$this->orderNumber} has shipped",
                PackageStatus::OutForDelivery => "Your BLESSLUXE order is out for delivery",
                PackageStatus::Delivered      => "Your BLESSLUXE order has been delivered",
                PackageStatus::Returned       => "Your BLESSLUXE order {$this->orderNumber} was returned",
                default                       => "Update on your BLESSLUXE order {$this->orderNumber}",
            };

        return new Envelope(subject: $subject);
    }

    public function content(): Content
    {
        $base = rtrim((string) config('app.url', '/'), '/');

        return new Content(
            view: 'mail.shipment-update',
            with: [
                'package'      => $this->package,
                'status'       => $this->status,
                'headline'     => $this->package->is_pack
                    ? $this->status->consignmentLabel()
                    : $this->status->label(),
                'orderNumber'  => $this->orderNumber,
                'pieces'       => $this->pieces,
                'isPack'       => (bool) $this->package->is_pack,
                // "Delivered" on a consignment means BLESSLUXE has it, not the buyer.
                'arrivedAtHub' => $this->package->is_pack && $this->status === PackageStatus::Delivered,
                'carrierLabel' => Carriers::label($this->package->carrier),
                'carrierUrl'   => Carriers::trackingUrl($this->package->carrier, $this->package->carrier_tracking_number),
                'trackingRef'  => $this->package->carrier_tracking_number,
                'trackUrl'     => $base . '/track/' . $this->package->package_code,
                'orderUrl'     => $base . '/account/orders/' . $this->orderNumber,
            ],
        );
    }
}
