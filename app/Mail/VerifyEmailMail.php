<?php

namespace App\Mail;

use App\Models\Customer;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class VerifyEmailMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Customer $customer, public string $verifyUrl)
    {
    }

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Confirm your BLESSLUXE email');
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.verify-email',
            with: [
                'firstName' => $this->customer->first_name ?: 'there',
                'verifyUrl' => $this->verifyUrl,
            ],
        );
    }
}
