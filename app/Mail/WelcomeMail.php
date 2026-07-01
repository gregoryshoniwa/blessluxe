<?php

namespace App\Mail;

use App\Models\Customer;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class WelcomeMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(public Customer $customer)
    {
    }

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Welcome to BLESSLUXE',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.welcome',
            with: [
                'firstName' => $this->customer->first_name ?: 'there',
                'storeUrl'  => rtrim(config('app.url', '/'), '/') . '/shop',
                'accountUrl'=> rtrim(config('app.url', '/'), '/') . '/account',
            ],
        );
    }
}
