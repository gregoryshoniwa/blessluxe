<?php

namespace App\Mail;

use App\Models\Order;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class OrderRefundMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Order $order, public ?string $reason = null) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your BLESSLUXE order ' . $this->order->order_number . ' has been refunded',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.order-refund',
            with: [
                'order'        => $this->order,
                'amount'       => '$' . number_format($this->order->total / 100, 2),
                'reason'       => $this->reason,
                'blitsRefunded'=> (int) ($this->order->metadata['blits_debited'] ?? 0),
            ],
        );
    }
}
