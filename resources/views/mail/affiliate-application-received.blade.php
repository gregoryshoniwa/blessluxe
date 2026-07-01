<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Application received</title></head>
<body style="margin:0;padding:0;background:#FDF8F3;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FDF8F3;padding:40px 0;">
        <tr><td align="center">
            <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-top:3px solid #C9A84C;">
                <tr><td style="padding:48px 48px 0;text-align:center;">
                    <img src="{{ $message->embed(public_path('logo.png')) }}" alt="BLESSLUXE" height="72" style="height:72px;width:auto;display:inline-block;" />
                    <p style="font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:#666;margin:14px 0 0;">Affiliate · Application received</p>
                </td></tr>
                <tr><td style="padding:36px 48px 32px;">
                    <h2 style="font-family:'Georgia',serif;font-size:24px;font-weight:500;color:#000;margin:0 0 16px;">Thank you, {{ $affiliate->first_name }}.</h2>
                    <p style="line-height:1.6;color:#444;margin:0 0 16px;">
                        We've received your application to join the BLESSLUXE affiliate programme. Our team reviews new applications within a couple of business days.
                    </p>
                    <p style="line-height:1.6;color:#444;margin:0 0 16px;">
                        While we look it over, your reserved code is
                        <span style="font-family:'Courier New',monospace;color:#B8860B;font-weight:700;">{{ $affiliate->code }}</span>.
                        Once approved, you'll receive a follow-up email with your dashboard link and a ready-to-share URL.
                    </p>
                    <p style="font-size:13px;line-height:1.5;color:#666;margin:0;">
                        Questions? Reply to this email or write to <a href="mailto:info@blessluxe.com" style="color:#B8860B;">info@blessluxe.com</a>.
                    </p>
                </td></tr>
                <tr><td style="background:#F5EDE3;padding:20px;text-align:center;">
                    <p style="font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:#666;margin:0;">BLESSLUXE · Luxury Atelier</p>
                </td></tr>
            </table>
        </td></tr>
    </table>
</body>
</html>
