<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{{ $bodyText ? 'A note from LUXE' : 'Picks from LUXE' }}</title>
</head>
<body style="margin:0;padding:0;background:#FDF8F3;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FDF8F3;padding:40px 0;">
        <tr><td align="center">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#fff;border-top:3px solid #C9A84C;">
                <tr><td style="padding:48px 48px 0;text-align:center;">
                    <img src="{{ $message->embed(public_path('logo.png')) }}" alt="BLESSLUXE" height="64" style="height:64px;width:auto;" />
                    <p style="font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:#666;margin:14px 0 0;">A note from LUXE</p>
                </td></tr>
                <tr><td style="padding:32px 48px 8px;">
                    <h2 style="font-family:'Georgia',serif;font-size:24px;font-weight:500;color:#000;margin:0 0 12px;">{{ $firstName }},</h2>
                    @if ($bodyText)
                        <p style="line-height:1.65;color:#333;white-space:pre-wrap;margin:0 0 20px;">{{ $bodyText }}</p>
                    @endif
                </td></tr>
                @if (! empty($products))
                    <tr><td style="padding:0 32px 24px;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                            <tr>
                                @foreach (array_slice($products, 0, 3) as $p)
                                    <td width="33%" style="padding:8px;vertical-align:top;" align="center">
                                        @if ($p['thumbnail'] ?? null)
                                            <a href="{{ rtrim(config('app.url'), '/') }}/shop/{{ $p['handle'] }}" style="display:block;text-decoration:none;color:#000;">
                                                <img src="{{ $p['thumbnail'] }}" alt="{{ $p['title'] }}" width="160" style="width:160px;height:auto;display:block;border:1px solid #eee;" />
                                                <p style="font-family:'Georgia',serif;font-size:13px;margin:8px 0 0;line-height:1.3;">{{ $p['title'] }}</p>
                                            </a>
                                        @endif
                                    </td>
                                @endforeach
                            </tr>
                        </table>
                    </td></tr>
                @endif
                <tr><td style="padding:0 48px 36px;">
                    <p style="margin:0;">
                        <a href="{{ rtrim(config('app.url'), '/') }}/shop" style="display:inline-block;background:#C9A84C;color:#fff;text-decoration:none;padding:12px 30px;font-size:11px;letter-spacing:.3em;text-transform:uppercase;font-weight:600;">Continue shopping</a>
                    </p>
                </td></tr>
                <tr><td style="background:#F5EDE3;padding:20px;text-align:center;">
                    <p style="font-size:10px;letter-spacing:.32em;text-transform:uppercase;color:#666;margin:0;">
                        <a href="mailto:info@blessluxe.com" style="color:#666;text-decoration:none;">info@blessluxe.com</a>
                    </p>
                </td></tr>
            </table>
        </td></tr>
    </table>
</body>
</html>
