<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>You're in</title></head>
<body style="margin:0;padding:0;background:#FDF8F3;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FDF8F3;padding:40px 0;">
        <tr><td align="center">
            <table role="presentation" width="560" cellspacing="0" cellpadding="0" style="background:#ffffff;border-top:3px solid #C9A84C;">
                <tr><td style="padding:48px 48px 0;text-align:center;">
                    <img src="{{ $message->embed(public_path('logo.png')) }}" alt="BLESSLUXE" height="72" style="height:72px;width:auto;display:inline-block;" />
                    <p style="font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:#666;margin:14px 0 0;">Affiliate · Approved</p>
                </td></tr>
                <tr><td style="padding:36px 48px 0;">
                    <h2 style="font-family:'Georgia',serif;font-size:26px;font-weight:500;color:#000;margin:0 0 16px;">Welcome to the programme, {{ $affiliate->first_name }}.</h2>
                    <p style="line-height:1.6;color:#444;margin:0 0 20px;">
                        You've been approved at <strong>{{ $affiliate->commission_rate }}%</strong> commission on every sale tagged to your link.
                    </p>
                </td></tr>
                <tr><td style="padding:0 48px 12px;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5EDE3;border:1px solid #C9A84C;">
                        <tr><td style="padding:20px;text-align:center;">
                            <p style="font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:#666;margin:0 0 4px;">Your share link</p>
                            <p style="font-family:'Courier New',monospace;font-size:14px;color:#000;margin:0;word-break:break-all;">{{ $shareUrl }}</p>
                        </td></tr>
                    </table>
                </td></tr>
                <tr><td style="padding:24px 48px 32px;">
                    <p style="font-size:14px;line-height:1.6;color:#444;margin:0 0 20px;">
                        Sign in with <strong>{{ $affiliate->email }}</strong> to view your earnings, recent sales, and payout history.
                    </p>
                    <p style="margin:0;">
                        <a href="{{ $dashboardUrl }}" style="display:inline-block;background:#C9A84C;color:#fff;text-decoration:none;padding:12px 28px;font-size:11px;letter-spacing:.3em;text-transform:uppercase;font-weight:600;">Open dashboard</a>
                        <a href="{{ $shareUrl }}" style="display:inline-block;border:1px solid #C9A84C;color:#B8860B;text-decoration:none;padding:12px 24px;font-size:11px;letter-spacing:.3em;text-transform:uppercase;font-weight:600;margin-left:8px;">Share now</a>
                    </p>
                </td></tr>
                <tr><td style="background:#F5EDE3;padding:20px;text-align:center;">
                    <p style="font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:#666;margin:0;">Questions? <a href="mailto:info@blessluxe.com" style="color:#B8860B;text-decoration:none;">info@blessluxe.com</a></p>
                </td></tr>
            </table>
        </td></tr>
    </table>
</body>
</html>
