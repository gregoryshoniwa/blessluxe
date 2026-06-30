<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Your BLESSLUXE payout is on its way</title></head>
<body style="margin:0;padding:0;background:#FDF8F3;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FDF8F3;padding:40px 0;">
        <tr><td align="center">
            <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-top:3px solid #C9A84C;">
                <tr><td style="padding:48px 48px 0;text-align:center;">
                    <img src="{{ $message->embed(public_path('logo.png')) }}" alt="BLESSLUXE" height="72" style="height:72px;width:auto;display:inline-block;" />
                    <p style="font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:#666;margin:14px 0 0;">Payout sent</p>
                </td></tr>

                <tr><td style="padding:36px 48px 8px;">
                    <p style="font-family:'Georgia',serif;font-style:italic;color:#B8860B;font-size:20px;margin:0 0 4px;">Thank you,</p>
                    <h2 style="font-family:'Georgia',serif;font-size:26px;font-weight:500;color:#000;margin:0 0 16px;">
                        {{ trim(($affiliate->first_name ?? '') . ' ' . ($affiliate->last_name ?? '')) ?: $affiliate->code }}.
                    </h2>
                    <p style="line-height:1.6;color:#444;margin:0 0 16px;">
                        We've just settled a commission payout to you.
                    </p>
                </td></tr>

                <tr><td style="padding:8px 48px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5EDE3;border:1px solid #C9A84C;">
                        <tr><td style="padding:24px;text-align:center;">
                            <p style="font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:#666;margin:0 0 4px;">Amount</p>
                            <p style="font-family:'Georgia',serif;font-size:38px;font-weight:500;color:#B8860B;margin:0;">{{ $amount }}</p>
                            <p style="font-size:12px;color:#666;margin:6px 0 0;">via {{ $methodLabel }}</p>
                            @if ($payout->reference)
                                <p style="font-family:'Courier New',monospace;font-size:11px;color:#666;margin:6px 0 0;">ref · {{ $payout->reference }}</p>
                            @endif
                        </td></tr>
                    </table>
                </td></tr>

                <tr><td style="padding:24px 48px 32px;">
                    @if ($payout->notes)
                        <p style="font-size:13px;color:#444;line-height:1.6;margin:0 0 16px;font-style:italic;">{{ $payout->notes }}</p>
                    @endif
                    <p style="font-size:14px;line-height:1.6;color:#444;margin:0 0 20px;">
                        Please allow 1–3 business days for the funds to reach you depending on your method.
                    </p>
                    <p style="margin:0;">
                        <a href="{{ $dashboardUrl }}" style="display:inline-block;background:#C9A84C;color:#fff;text-decoration:none;padding:12px 28px;font-size:11px;letter-spacing:.3em;text-transform:uppercase;font-weight:600;">View dashboard</a>
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
