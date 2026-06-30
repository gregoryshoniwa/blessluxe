<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <link rel="icon" href="/icon.png">
    <title>Admin · {{ config('app.name', 'BlessLuxe') }}</title>
    @vite(['resources/css/app.css', 'resources/js/admin.js'])
</head>
<body class="font-body antialiased bg-zinc-50 text-zinc-900">
    <div id="admin-app"></div>
</body>
</html>
