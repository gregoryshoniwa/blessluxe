<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Order refunded · BLESSLUXE</title></head>
<body style="margin:0;padding:0;background:#FDF8F3;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FDF8F3;padding:40px 0;">
        <tr><td align="center">
            <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-top:3px solid #C9A84C;">
                <tr><td style="padding:48px 48px 0;text-align:center;">
                    <img src="{{ $message->embed(public_path('logo.png')) }}" alt="BLESSLUXE" height="72" style="height:72px;width:auto;display:inline-block;" />
                    <p style="font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:#666;margin:14px 0 0;">Refund processed</p>
                </td></tr>

                <tr><td style="padding:36px 48px 8px;">
                    <p style="font-family:'Georgia',serif;font-style:italic;color:#B8860B;font-size:20px;margin:0 0 4px;">We're sorry,</p>
                    <h2 style="font-family:'Georgia',serif;font-size:26px;font-weight:500;color:#000;margin:0 0 16px;">your order has been refunded.</h2>
                    <p style="line-height:1.6;color:#444;margin:0 0 16px;">
                        Order <span style="font-family:'Courier New',monospace;">{{ $order->order_number }}</span>
                        has been cancelled and refunded for <strong>{{ $amount }}</strong>.
                    </p>
                    @if ($reason)
                        <p style="line-height:1.6;color:#666;margin:0 0 16px;font-style:italic;border-left:3px solid #C9A84C;padding-left:12px;">
                            {{ $reason }}
                        </p>
                    @endif
                    @if ($blitsRefunded > 0)
                        <p style="line-height:1.6;color:#444;margin:0 0 16px;">
                            <strong>{{ $blitsRefunded }} Blits</strong> have been returned to your balance.
                        </p>
                    @endif
                    <p style="line-height:1.6;color:#444;margin:0 0 16px;">
                        Funds will appear on your original payment method within 3–7 business days, depending on your bank or wallet.
                    </p>
                    <p style="font-size:13px;line-height:1.5;color:#666;margin:0;">
                        Questions about this refund? Reach out to <a href="mailto:info@blessluxe.com" style="color:#B8860B;">info@blessluxe.com</a>.
                    </p>
                </td></tr>

                <tr><td style="background:#F5EDE3;padding:20px;text-align:center;">
                    <p style="font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:#666;margin:0;">
                        BLESSLUXE · Luxury Atelier
                    </p>
                </td></tr>
            </table>
        </td></tr>
    </table>
</body>
</html>
