<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Welcome to BLESSLUXE</title>
</head>
<body style="margin:0;padding:0;background:#FDF8F3;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FDF8F3;padding:40px 0;">
        <tr><td align="center">
            <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-top:3px solid #C9A84C;">
                <tr><td style="padding:48px 48px 0;text-align:center;">
                    {{-- $message->embed() inlines the file as a cid: attachment
                         so the logo renders inside every mail client, even
                         when remote images are blocked. --}}
                    <img src="{{ $message->embed(public_path('logo.png')) }}" alt="BLESSLUXE" height="72" style="height:72px;width:auto;display:inline-block;" />
                    <p style="font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:#666;margin:14px 0 0;">Luxury Atelier</p>
                </td></tr>
                <tr><td style="padding:36px 48px;">
                    <h2 style="font-family:'Georgia',serif;font-size:26px;font-weight:500;color:#000;margin:0 0 16px;">Welcome, {{ $firstName }}.</h2>
                    <p style="line-height:1.6;color:#444;margin:0 0 16px;">
                        Your BLESSLUXE account is ready. You'll be the first to know when limited drops, new arrivals and member-only events land.
                    </p>
                    <p style="line-height:1.6;color:#444;margin:0 0 28px;">
                        Save pieces you love to your wishlist, earn Blits on every order, and join curated group buys ("Packs") whenever they open.
                    </p>
                    <p style="margin:0 0 32px;">
                        <a href="{{ $storeUrl }}" style="display:inline-block;background:#C9A84C;color:#fff;text-decoration:none;padding:14px 36px;font-size:11px;letter-spacing:.3em;text-transform:uppercase;font-weight:600;">Begin shopping</a>
                    </p>
                    <p style="font-size:13px;line-height:1.5;color:#666;margin:0;">
                        Need anything? Reply to this email or write to <a href="mailto:info@blessluxe.com" style="color:#B8860B;">info@blessluxe.com</a>.
                    </p>
                </td></tr>
                <tr><td style="background:#F5EDE3;padding:24px;text-align:center;">
                    <p style="font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:#666;margin:0;">
                        <a href="{{ $accountUrl }}" style="color:#666;text-decoration:none;">Manage account</a>
                        &nbsp;·&nbsp;
                        <a href="mailto:info@blessluxe.com" style="color:#666;text-decoration:none;">info@blessluxe.com</a>
                    </p>
                </td></tr>
            </table>
        </td></tr>
    </table>
</body>
</html>
