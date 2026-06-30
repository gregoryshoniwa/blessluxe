<?php

namespace App\Mail;

use App\Models\Affiliate;
use App\Models\AffiliateSale;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AffiliateSaleMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Affiliate $affiliate,
        public AffiliateSale $sale,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'You earned ' . $this->money($this->sale->commission_amount) . ' on a new BLESSLUXE sale',
        );
    }

    public function content(): Content
    {
        $base = rtrim(config('app.url', '/'), '/');
        return new Content(
            view: 'mail.affiliate-sale',
            with: [
                'affiliate'     => $this->affiliate,
                'sale'          => $this->sale,
                'commission'    => $this->money($this->sale->commission_amount),
                'orderTotal'    => $this->money($this->sale->order_total),
                'dashboardUrl'  => $base . '/affiliate/' . $this->affiliate->code . '/dashboard',
                'shareUrl'      => $base . '/affiliate/shop/' . $this->affiliate->code,
            ],
        );
    }

    private function money(int $cents): string
    {
        return '$' . number_format($cents / 100, 2);
    }
}
