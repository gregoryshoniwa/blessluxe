<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

/**
 * Posts from other platforms, shown inside a look.
 *
 * A member gives us a LINK. We recognise it, keep only (provider, reference),
 * and build the iframe address ourselves from that — the same rule the
 * affiliate hero uses for YouTube. A member can never supply the framed URL.
 *
 * Nothing loads from the other platform until a viewer taps: it costs them
 * data, and that platform will see their visit.
 */
class HiveEmbeds
{
    public const PROVIDERS = [
        'youtube'   => 'YouTube',
        'tiktok'    => 'TikTok',
        'instagram' => 'Instagram',
        'facebook'  => 'Facebook',
    ];

    /** @return array{provider:string, ref:string}|null */
    public static function parse(?string $url): ?array
    {
        $url = trim((string) $url);
        if (strlen($url) > 500 || ! preg_match('~^https://~i', $url)) return null;
        $host = strtolower(preg_replace('~^(www|m|mobile|web|l)\.~', '', (string) parse_url($url, PHP_URL_HOST)));
        $path = (string) parse_url($url, PHP_URL_PATH);

        if (in_array($host, ['youtube.com', 'youtu.be', 'music.youtube.com', 'youtube-nocookie.com'], true)) {
            $id = AffiliateLook::youtubeId($url);

            return $id ? ['provider' => 'youtube', 'ref' => (str_contains($path, '/shorts/') ? 's:' : 'v:') . $id] : null;
        }

        if ($host === 'tiktok.com' && preg_match('~^/@[\w.\-]{1,40}/(?:video|photo)/(\d{8,25})~', $path, $m)) {
            return ['provider' => 'tiktok', 'ref' => $m[1]];
        }
        // Share-sheet links (vm.tiktok.com/XXXX) hide the id; TikTok's own oEmbed reveals it.
        if (in_array($host, ['vm.tiktok.com', 'vt.tiktok.com'], true) || ($host === 'tiktok.com' && str_starts_with($path, '/t/'))) {
            $id = self::tiktokOembed($url)['id'] ?? null;

            return $id ? ['provider' => 'tiktok', 'ref' => $id] : null;
        }

        if (in_array($host, ['instagram.com', 'instagr.am'], true) && preg_match('~^/(?:[\w.]+/)?(p|reel|reels|tv)/([A-Za-z0-9_-]{5,40})~', $path, $m)) {
            return ['provider' => 'instagram', 'ref' => ($m[1] === 'p' ? 'p' : ($m[1] === 'tv' ? 'tv' : 'reel')) . '/' . $m[2]];
        }

        if (in_array($host, ['facebook.com', 'fb.watch', 'fb.com'], true) && strlen($path) > 1) {
            // Facebook's plugin takes the post's address, so that is the reference —
            // rebuilt from host + path (+ the few query keys posts really use).
            parse_str((string) parse_url($url, PHP_URL_QUERY), $q);
            $keep = array_intersect_key($q, array_flip(['v', 'story_fbid', 'id', 'fbid']));
            $clean = 'https://' . ($host === 'fb.watch' ? 'fb.watch' : 'www.facebook.com') . $path . ($keep ? '?' . http_build_query($keep) : '');
            $isVideo = $host === 'fb.watch' || preg_match('~/(videos|watch|reel|reels)(/|$)~', $path) || isset($keep['v']);

            return ['provider' => 'facebook', 'ref' => ($isVideo ? 'v|' : 'p|') . $clean];
        }

        return null;
    }

    /** The address we frame. Built here, from a reference we parsed — never from the member's text. */
    public static function embedUrl(string $provider, string $ref): ?string
    {
        return match ($provider) {
            'youtube'   => 'https://www.youtube-nocookie.com/embed/' . substr($ref, 2) . '?rel=0&playsinline=1&autoplay=1',
            'tiktok'    => 'https://www.tiktok.com/player/v1/' . $ref . '?autoplay=1&rel=0',
            'instagram' => 'https://www.instagram.com/' . $ref . '/embed/',
            'facebook'  => 'https://www.facebook.com/plugins/' . (str_starts_with($ref, 'v|') ? 'video' : 'post') . '.php?show_text=false&width=500&href=' . rawurlencode(substr($ref, 2)),
            default     => null,
        };
    }

    /** Where "open in the app" goes. */
    public static function sourceUrl(string $provider, string $ref): ?string
    {
        return match ($provider) {
            'youtube'   => (str_starts_with($ref, 's:') ? 'https://www.youtube.com/shorts/' : 'https://www.youtube.com/watch?v=') . substr($ref, 2),
            'tiktok'    => 'https://www.tiktok.com/@_/video/' . $ref,
            'instagram' => 'https://www.instagram.com/' . $ref . '/',
            'facebook'  => substr($ref, 2),
            default     => null,
        };
    }

    public static function present(?string $provider, ?string $ref): ?array
    {
        if (! $provider || ! $ref || ! isset(self::PROVIDERS[$provider])) return null;

        return [
            'provider' => $provider,
            'label'    => self::PROVIDERS[$provider],
            'url'      => self::embedUrl($provider, $ref),
            'source'   => self::sourceUrl($provider, $ref),
            // Tall for phone-shaped video, wide for ordinary YouTube, in between for posts.
            'shape'    => $provider === 'tiktok' || $ref[0] === 's' || str_starts_with($ref, 'reel/') ? 'tall' : ($provider === 'youtube' || str_starts_with($ref, 'v|') ? 'wide' : 'post'),
        ];
    }

    /**
     * A cover picture, copied into our storage — where the platform offers one
     * without an API key (YouTube, TikTok). Instagram and Facebook don't, so
     * those looks show a branded tile instead. Never fatal.
     */
    public static function cover(string $provider, string $ref, string $dir): ?string
    {
        try {
            $src = match ($provider) {
                'youtube' => 'https://i.ytimg.com/vi/' . substr($ref, 2) . '/hqdefault.jpg',
                'tiktok'  => self::tiktokOembed('https://www.tiktok.com/@_/video/' . $ref)['thumb'] ?? null,
                default   => null,
            };

            return $src ? RemoteImage::import($src, $dir) : null;
        } catch (\Throwable) {
            return null;
        }
    }

    /** @return array{id:?string, thumb:?string} */
    private static function tiktokOembed(string $url): array
    {
        try {
            $res = Http::timeout(6)->connectTimeout(3)->get('https://www.tiktok.com/oembed', ['url' => $url]);
            if (! $res->successful()) return ['id' => null, 'thumb' => null];
            preg_match('~data-video-id="(\d{8,25})"~', (string) $res->json('html'), $m);

            return ['id' => $m[1] ?? ($res->json('embed_product_id') ?: null), 'thumb' => $res->json('thumbnail_url') ?: null];
        } catch (\Throwable) {
            return ['id' => null, 'thumb' => null];
        }
    }
}
