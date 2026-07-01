<?php

namespace App\Mail;

use App\Models\Order;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class OrderReceiptMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Order $order)
    {
    }

    public function envelope(): Envelope
    {
        $bcc = trim((string) env('MAIL_ADMIN_BCC', ''));
        return new Envelope(
            subject: 'Your BLESSLUXE order ' . $this->order->order_number,
            bcc: $bcc ? [new Address($bcc, 'BlessLuxe Atelier')] : [],
        );
    }

    public function content(): Content
    {
        $lines = $this->order->lineItems()->get(['title', 'variant_title', 'quantity', 'unit_price']);
        $package = \App\Models\Package::where('order_id', $this->order->id)->first();
        $base = rtrim(config('app.url', '/'), '/');
        return new Content(
            view: 'mail.order-receipt',
            with: [
                'order'         => $this->order,
                'lines'         => $lines,
                'orderUrl'      => $base . '/checkout/confirmation?order=' . urlencode($this->order->order_number),
                'trackingCode'  => $package?->package_code,
                'trackingUrl'   => $package ? $base . '/track/' . $package->package_code : null,
                'subtotal'      => '$' . number_format($this->order->subtotal / 100, 2),
                'discount'      => $this->order->discount_total > 0 ? '$' . number_format($this->order->discount_total / 100, 2) : null,
                'shipping'      => '$' . number_format(($this->order->shipping_total ?? 0) / 100, 2),
                'total'         => '$' . number_format($this->order->total / 100, 2),
            ],
        );
    }
}
