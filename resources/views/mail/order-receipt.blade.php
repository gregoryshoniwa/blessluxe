<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Order receipt · BLESSLUXE</title>
</head>
<body style="margin:0;padding:0;background:#FDF8F3;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FDF8F3;padding:40px 0;">
        <tr><td align="center">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border-top:3px solid #C9A84C;">
                <tr><td style="padding:48px 48px 0;text-align:center;">
                    <img src="{{ $message->embed(public_path('logo.png')) }}" alt="BLESSLUXE" height="72" style="height:72px;width:auto;display:inline-block;" />
                    <p style="font-family:'Georgia',serif;font-style:italic;color:#B8860B;font-size:18px;margin:14px 0 0;">Thank you</p>
                    <p style="font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:#666;margin:14px 0 0;">Order receipt</p>
                </td></tr>

                <tr><td style="padding:32px 48px 0;">
                    <p style="font-size:13px;color:#666;margin:0 0 4px;text-transform:uppercase;letter-spacing:.18em;">Order number</p>
                    <p style="font-family:'Courier New',monospace;font-size:18px;margin:0 0 24px;color:#000;">{{ $order->order_number }}</p>
                </td></tr>

                <tr><td style="padding:0 48px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                        <thead>
                            <tr style="background:#F5EDE3;">
                                <th align="left"  style="padding:10px 12px;font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:#666;font-weight:600;">Item</th>
                                <th align="right" style="padding:10px 12px;font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:#666;font-weight:600;">Qty</th>
                                <th align="right" style="padding:10px 12px;font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:#666;font-weight:600;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            @foreach ($lines as $l)
                                <tr style="border-bottom:1px solid #F5EDE3;">
                                    <td style="padding:14px 12px;">
                                        <p style="margin:0;font-family:'Georgia',serif;font-size:15px;">{{ $l->title }}</p>
                                        @if ($l->variant_title)
                                            <p style="margin:2px 0 0;font-size:12px;color:#666;">{{ $l->variant_title }}</p>
                                        @endif
                                    </td>
                                    <td align="right" style="padding:14px 12px;font-size:14px;">{{ $l->quantity }}</td>
                                    <td align="right" style="padding:14px 12px;font-size:14px;">${{ number_format(($l->unit_price * $l->quantity) / 100, 2) }}</td>
                                </tr>
                            @endforeach
                        </tbody>
                    </table>
                </td></tr>

                <tr><td style="padding:16px 48px 8px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                        <tr><td style="padding:6px 0;font-size:14px;color:#666;">Subtotal</td><td align="right" style="padding:6px 0;font-size:14px;">{{ $subtotal }}</td></tr>
                        @if ($discount)
                            <tr><td style="padding:6px 0;font-size:14px;color:#0a7e2a;">Discount</td><td align="right" style="padding:6px 0;font-size:14px;color:#0a7e2a;">-{{ $discount }}</td></tr>
                        @endif
                        <tr><td style="padding:6px 0;font-size:14px;color:#666;">Shipping</td><td align="right" style="padding:6px 0;font-size:14px;">{{ $shipping }}</td></tr>
                        <tr><td style="padding:14px 0 0;border-top:1px solid #C9A84C;font-family:'Georgia',serif;font-size:18px;font-weight:500;">Total</td><td align="right" style="padding:14px 0 0;border-top:1px solid #C9A84C;font-family:'Georgia',serif;font-size:18px;font-weight:500;">{{ $total }}</td></tr>
                    </table>
                </td></tr>

                <tr><td style="padding:24px 48px 32px;">
                    <p style="margin:0 0 8px;font-size:13px;color:#666;text-transform:uppercase;letter-spacing:.18em;">Status</p>
                    <p style="margin:0 0 20px;font-size:14px;">Payment received · {{ ucfirst($order->payment_method ?? 'paid') }}</p>
                    @if ($trackingCode)
                        <p style="margin:0 0 8px;font-size:13px;color:#666;text-transform:uppercase;letter-spacing:.18em;">Tracking code</p>
                        <p style="margin:0 0 20px;font-family:'Courier New',monospace;font-size:16px;">{{ $trackingCode }}</p>
                    @endif
                    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#444;">
                        We're preparing your order. You'll receive another email when it ships.
                    </p>
                    <p style="margin:0;">
                        <a href="{{ $orderUrl }}" style="display:inline-block;background:#C9A84C;color:#fff;text-decoration:none;padding:12px 28px;font-size:11px;letter-spacing:.3em;text-transform:uppercase;font-weight:600;">View order</a>
                        @if ($trackingUrl)
                            <a href="{{ $trackingUrl }}" style="display:inline-block;border:1px solid #C9A84C;color:#B8860B;text-decoration:none;padding:12px 24px;font-size:11px;letter-spacing:.3em;text-transform:uppercase;font-weight:600;margin-left:8px;">Track package</a>
                        @endif
                    </p>
                </td></tr>

                <tr><td style="background:#F5EDE3;padding:20px;text-align:center;">
                    <p style="font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:#666;margin:0;">
                        Questions? <a href="mailto:info@blessluxe.com" style="color:#B8860B;text-decoration:none;">info@blessluxe.com</a>
                    </p>
                </td></tr>
            </table>
        </td></tr>
    </table>
</body>
</html>
