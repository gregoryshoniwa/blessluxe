<?php

namespace App\Mail;

use App\Models\Customer;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AgentDigestMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Customer $customer,
        public string $subjectLine,
        public string $bodyText,
        public array $products = [],
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->subjectLine);
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.agent-digest',
            with: [
                'firstName' => $this->customer->first_name ?: 'there',
                'bodyText'  => $this->bodyText,
                'products'  => $this->products,
            ],
        );
    }
}
