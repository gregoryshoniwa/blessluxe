@php
    $defaultMeta = [
        'title'       => 'BLESSLUXE — Luxury Atelier',
        'description' => 'Curated luxury women\'s fashion. Drops, group buys and Blits loyalty.',
        'image'       => rtrim(config('app.url', url('/')), '/') . '/logo.png',
        'canonical'   => url()->current(),
        'type'        => 'website',
        'json_ld'     => null,
    ];
    $meta = array_merge($defaultMeta, $meta ?? []);
@endphp
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" href="/icon.png">
    <title>{{ $meta['title'] }}</title>
    <meta name="description" content="{{ $meta['description'] }}">
    <link rel="canonical" href="{{ $meta['canonical'] }}">

    {{-- Open Graph (Facebook, LinkedIn, WhatsApp, etc.) --}}
    <meta property="og:site_name" content="BLESSLUXE">
    <meta property="og:type" content="{{ $meta['type'] }}">
    <meta property="og:title" content="{{ $meta['title'] }}">
    <meta property="og:description" content="{{ $meta['description'] }}">
    <meta property="og:image" content="{{ $meta['image'] }}">
    <meta property="og:url" content="{{ $meta['canonical'] }}">

    {{-- Twitter / X cards --}}
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="{{ $meta['title'] }}">
    <meta name="twitter:description" content="{{ $meta['description'] }}">
    <meta name="twitter:image" content="{{ $meta['image'] }}">

    @if (! empty($meta['json_ld']))
        <script type="application/ld+json">{!! json_encode(array_filter($meta['json_ld'], fn ($v) => $v !== null), JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) !!}</script>
    @endif

    @vite(['resources/css/app.css', 'resources/js/store.js'])
</head>
<body class="font-body antialiased bg-cream text-black">
    <div id="store-app"></div>
</body>
</html>
