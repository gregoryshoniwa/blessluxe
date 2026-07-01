<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Confirm your BLESSLUXE email</title>
</head>
<body style="margin:0;padding:0;background:#FDF8F3;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FDF8F3;padding:40px 0;">
        <tr><td align="center">
            <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-top:3px solid #C9A84C;">
                <tr><td style="padding:48px 48px 0;text-align:center;">
                    <img src="{{ $message->embed(public_path('logo.png')) }}" alt="BLESSLUXE" height="72" style="height:72px;width:auto;display:inline-block;" />
                    <p style="font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:#666;margin:14px 0 0;">Verify your email</p>
                </td></tr>
                <tr><td style="padding:36px 48px;">
                    <h2 style="font-family:'Georgia',serif;font-size:26px;font-weight:500;color:#000;margin:0 0 16px;">Confirm it's you, {{ $firstName }}.</h2>
                    <p style="line-height:1.6;color:#444;margin:0 0 28px;">
                        Tap the button below to confirm this email address. Verified accounts can recover lost passwords and receive Blits gifts.
                    </p>
                    <p style="margin:0 0 28px;">
                        <a href="{{ $verifyUrl }}" style="display:inline-block;background:#C9A84C;color:#fff;text-decoration:none;padding:14px 36px;font-size:11px;letter-spacing:.3em;text-transform:uppercase;font-weight:600;">Confirm email</a>
                    </p>
                    <p style="font-size:13px;line-height:1.5;color:#666;margin:0 0 8px;">Or paste this link into your browser:</p>
                    <p style="font-size:12px;line-height:1.5;color:#888;word-break:break-all;margin:0 0 24px;">{{ $verifyUrl }}</p>
                    <p style="font-size:13px;line-height:1.5;color:#666;margin:0;">
                        Didn't sign up? You can safely ignore this email.
                    </p>
                </td></tr>
                <tr><td style="background:#F5EDE3;padding:24px;text-align:center;">
                    <p style="font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:#666;margin:0;">
                        <a href="mailto:info@blessluxe.com" style="color:#666;text-decoration:none;">info@blessluxe.com</a>
                    </p>
                </td></tr>
            </table>
        </td></tr>
    </table>
</body>
</html>
