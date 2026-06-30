<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" href="/icon.png">
    <title>{{ config('app.name', 'BlessLuxe') }}</title>
    @vite(['resources/css/app.css', 'resources/js/store.js'])
</head>
<body class="font-body antialiased bg-cream text-black">
    <div id="store-app"></div>
</body>
</html>
