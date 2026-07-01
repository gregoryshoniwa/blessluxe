<?php

namespace App\Mail;

use App\Models\Affiliate;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AffiliateApprovedMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Affiliate $affiliate) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "You're in — BLESSLUXE affiliate dashboard is live");
    }

    public function content(): Content
    {
        $base = rtrim(config('app.url', '/'), '/');
        return new Content(
            view: 'mail.affiliate-approved',
            with: [
                'affiliate'   => $this->affiliate,
                'shareUrl'    => $base . '/affiliate/shop/' . $this->affiliate->code,
                'dashboardUrl'=> $base . '/affiliate/' . $this->affiliate->code . '/dashboard',
            ],
        );
    }
}
