<?php

namespace App\Mail;

use App\Models\Affiliate;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AffiliateApplicationReceivedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Affiliate $affiliate) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'We received your BLESSLUXE affiliate application');
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.affiliate-application-received',
            with: ['affiliate' => $this->affiliate],
        );
    }
}
