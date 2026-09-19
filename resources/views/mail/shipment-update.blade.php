<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Shipment update · BLESSLUXE</title>
</head>
<body style="margin:0;padding:0;background:#FDF8F3;font-family:'Helvetica Neue',Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FDF8F3;padding:40px 0;">
        <tr><td align="center">
            <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background:#ffffff;border-top:3px solid #C9A84C;">

                <tr><td style="padding:48px 48px 0;text-align:center;">
                    <img src="{{ $message->embed(public_path('logo.png')) }}" alt="BLESSLUXE" height="72" style="height:72px;width:auto;display:inline-block;" />
                    <p style="font-family:'Georgia',serif;font-style:italic;color:#B8860B;font-size:18px;margin:14px 0 0;">
                        {{ $arrivedAtHub ? 'It has landed' : 'On the move' }}
                    </p>
                    <p style="font-size:11px;letter-spacing:.32em;text-transform:uppercase;color:#666;margin:14px 0 0;">{{ $headline }}</p>
                </td></tr>

                <tr><td style="padding:32px 48px 0;">
                    <p style="font-size:13px;color:#666;margin:0 0 4px;text-transform:uppercase;letter-spacing:.18em;">Order</p>
                    <p style="font-family:'Courier New',monospace;font-size:18px;margin:0 0 8px;color:#000;">{{ $orderNumber }}</p>
                </td></tr>

                {{-- A consignment's "delivered" means BLESSLUXE has the goods, not the
                     customer. Saying otherwise would be a plain lie, so this block
                     tells them exactly what happened and what to do next. --}}
                @if ($arrivedAtHub)
                    <tr><td style="padding:16px 48px 0;">
                        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#F5EDE3;border:1px solid rgba(201,168,76,.4);">
                            <tr><td style="padding:20px 24px;">
                                <p style="font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:#666;margin:0 0 10px;">Your collection code</p>
                                @foreach ($pieces as $piece)
                                    @if ($piece->collection_pin)
                                        <p style="font-family:'Courier New',monospace;font-size:26px;letter-spacing:.3em;color:#B8860B;margin:0 0 6px;">{{ $piece->collection_pin }}</p>
                                        @if ($piece->size_label)
                                            <p style="font-size:12px;color:#666;margin:0 0 12px;">Size {{ $piece->size_label }}</p>
                                        @endif
                                    @endif
                                @endforeach
                                <p style="font-size:13px;color:#444;margin:10px 0 0;line-height:1.6;">
                                    Show this code when you collect. Keep it to yourself — anyone with it can claim your piece.
                                </p>
                            </td></tr>
                        </table>
                    </td></tr>
                @endif

                {{-- What's in this shipment. --}}
                <tr><td style="padding:24px 48px 0;">
                    <p style="font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:#666;margin:0 0 10px;">
                        {{ $isPack ? 'Your piece' : 'In this shipment' }}
                    </p>
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                        @foreach ($pieces as $piece)
                            <tr style="border-bottom:1px solid #f0e9df;">
                                <td style="padding:10px 0;font-size:14px;color:#1a1a1a;">
                                    {{ $piece->product_title }}
                                    @if ($piece->size_label || $piece->variant_title)
                                        <span style="color:#888;font-size:12px;"> · {{ $piece->size_label ?: $piece->variant_title }}</span>
                                    @endif
                                </td>
                                <td align="right" style="padding:10px 0;font-size:13px;color:#666;">×{{ $piece->quantity }}</td>
                            </tr>
                        @endforeach
                    </table>
                </td></tr>

                {{-- Carrier, linked where we can build a real deep link. --}}
                @if ($carrierLabel)
                    <tr><td style="padding:24px 48px 0;">
                        <p style="font-size:10px;letter-spacing:.28em;text-transform:uppercase;color:#666;margin:0 0 6px;">Carrier</p>
                        <p style="font-size:14px;margin:0;color:#1a1a1a;">
                            {{ $carrierLabel }}
                            @if ($trackingRef)
                                @if ($carrierUrl)
                                    · <a href="{{ $carrierUrl }}" style="font-family:'Courier New',monospace;color:#B8860B;">{{ $trackingRef }}</a>
                                @else
                                    · <span style="font-family:'Courier New',monospace;color:#666;">{{ $trackingRef }}</span>
                                @endif
                            @endif
                        </p>
                    </td></tr>
                @endif

                <tr><td style="padding:32px 48px 48px;text-align:center;">
                    <a href="{{ $orderUrl }}" style="display:inline-block;background:#C9A84C;color:#ffffff;text-decoration:none;padding:14px 32px;font-size:11px;letter-spacing:.3em;text-transform:uppercase;">
                        View your order
                    </a>
                    <p style="font-size:12px;color:#888;margin:18px 0 0;">
                        Or track it at <a href="{{ $trackUrl }}" style="color:#B8860B;">{{ $package->package_code }}</a>
                    </p>
                </td></tr>

                <tr><td style="padding:0 48px 40px;text-align:center;">
                    <p style="font-size:11px;color:#aaa;margin:0;">BLESSLUXE · Harare, Zimbabwe</p>
                </td></tr>
            </table>
        </td></tr>
    </table>
</body>
</html>
