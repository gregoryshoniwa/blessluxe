<?php

namespace App\Mail;

use App\Models\Affiliate;
use App\Models\AffiliatePayout;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AffiliatePayoutMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Affiliate $affiliate,
        public AffiliatePayout $payout,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Your BLESSLUXE payout of ' . $this->money($this->payout->amount) . ' is on its way',
        );
    }

    public function content(): Content
    {
        $base = rtrim(config('app.url', '/'), '/');
        return new Content(
            view: 'mail.affiliate-payout',
            with: [
                'affiliate'    => $this->affiliate,
                'payout'       => $this->payout,
                'amount'       => $this->money($this->payout->amount),
                'methodLabel'  => ucwords(str_replace('_', ' ', (string) $this->payout->method)),
                'dashboardUrl' => $base . '/affiliate/' . $this->affiliate->code . '/dashboard',
            ],
        );
    }

    private function money(int $cents): string
    {
        return '$' . number_format($cents / 100, 2);
    }
}
