<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;

/**
 * Copy an image from someone else's server into ours.
 *
 * Why copy instead of showing the link: Instagram and Facebook image addresses
 * expire within days; a hot-linked picture can be swapped for something else
 * AFTER staff have looked at it; and every viewer's phone would be talking to a
 * third party. One fetch, then it is ours — shrunk, re-encoded, and stable.
 *
 * Fetching a URL that a member typed is the classic way to get a server to
 * attack its own network (SSRF), so:
 *   - https only, port 443 only, no credentials in the URL, no bare IPs
 *   - the host is resolved HERE and every address must be public; the request
 *     is then pinned to that address, so DNS can't answer differently later
 *   - redirects are followed by hand (max 3), each hop checked the same way
 *   - hard limits on time and size; the bytes must really be an image, and are
 *     re-encoded through GD, which drops anything that isn't pixels
 */
class RemoteImage
{
    public const MAX_BYTES = 10 * 1024 * 1024;
    public const MAX_EDGE = 1080;

    /** Swapped out in tests. fn(string $host): array<string> of IPs */
    public static $resolver = null;

    /**
     * @return string the stored URL
     * @throws \RuntimeException with a message fit to show a person
     */
    public static function import(string $url, string $dir): string
    {
        $bytes = self::fetch($url);

        $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes) ?: '';
        if (! in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true) || ! @getimagesizefromstring($bytes)) {
            throw new \RuntimeException("That link isn't a picture. Open the image itself and copy its address — or paste the post's link to embed it.");
        }

        [$ext, $out] = self::shrink($bytes, $mime);

        return Media::put($dir, $ext, $out);
    }

    /** Public + https + resolvable to public addresses only. Returns [host, ip]. */
    public static function vet(string $url): array
    {
        $p = parse_url(trim($url));
        $host = strtolower($p['host'] ?? '');
        if (($p['scheme'] ?? '') !== 'https' || $host === '' || isset($p['user']) || isset($p['pass']) || (isset($p['port']) && (int) $p['port'] !== 443)) {
            throw new \RuntimeException('Links need to start with https://');
        }
        if (filter_var(trim($host, '[]'), FILTER_VALIDATE_IP) || ! str_contains($host, '.') || str_ends_with($host, '.local') || str_ends_with($host, '.internal') || $host === 'localhost') {
            throw new \RuntimeException("We can't fetch from that address.");
        }

        $ips = self::$resolver ? (self::$resolver)($host) : array_merge(
            array_column(@dns_get_record($host, DNS_A) ?: [], 'ip'),
            array_column(@dns_get_record($host, DNS_AAAA) ?: [], 'ipv6'),
        );
        if (! $ips) throw new \RuntimeException("We couldn't find that website.");
        foreach ($ips as $ip) {
            if (! filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
                throw new \RuntimeException("We can't fetch from that address.");
            }
        }

        return [$host, $ips[0]];
    }

    private static function fetch(string $url): string
    {
        for ($hop = 0; $hop <= 3; $hop++) {
            [$host, $ip] = self::vet($url);

            try {
                $res = Http::timeout(8)->connectTimeout(4)->withoutRedirecting()
                    ->withHeaders(['User-Agent' => 'Mozilla/5.0 (compatible; BlessHive/1.0; +' . config('app.url') . ')', 'Accept' => 'image/*'])
                    ->withOptions([
                        // Pin the connection to the address we just vetted.
                        'curl' => [CURLOPT_RESOLVE => ["{$host}:443:" . (str_contains($ip, ':') ? "[{$ip}]" : $ip)], CURLOPT_PROTOCOLS => CURLPROTO_HTTPS],
                        'on_headers' => function ($r) {
                            if ((int) $r->getHeaderLine('Content-Length') > self::MAX_BYTES) throw new \RuntimeException('That picture is too large.');
                        },
                        'progress' => function ($total, $downloaded) {
                            if ($downloaded > self::MAX_BYTES) throw new \RuntimeException('That picture is too large.');
                        },
                    ])->get($url);
            } catch (\Throwable $e) {
                // Guzzle's own errors are RuntimeExceptions full of curl detail — never pass those through.
                throw new \RuntimeException(str_contains($e->getMessage(), 'too large') ? 'That picture is too large.' : "We couldn't reach that link. It may be private or have expired.");
            }

            if ($res->redirect()) {
                $next = (string) $res->header('Location');
                if ($next === '') break;
                $url = str_starts_with($next, '/') ? "https://{$host}{$next}" : $next;
                continue;
            }
            if (! $res->successful()) throw new \RuntimeException("We couldn't open that link. It may be private or have expired.");

            $body = $res->body();
            if (strlen($body) > self::MAX_BYTES) throw new \RuntimeException('That picture is too large.');
            if ($body === '') throw new \RuntimeException("That link didn't return a picture.");

            return $body;
        }

        throw new \RuntimeException('That link redirects too many times.');
    }

    /** Re-encode at ≤1080px. Without GD the verified original is kept as it is. @return array{0:string,1:string} */
    private static function shrink(string $bytes, string $mime): array
    {
        $fallback = [['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif'][$mime], $bytes];
        if (! function_exists('imagecreatefromstring') || ! ($src = @imagecreatefromstring($bytes))) return $fallback;

        [$w, $h] = [imagesx($src), imagesy($src)];
        $scale = min(1, self::MAX_EDGE / max($w, $h));
        [$nw, $nh] = [max(1, (int) round($w * $scale)), max(1, (int) round($h * $scale))];

        $dst = imagecreatetruecolor($nw, $nh);
        imagefill($dst, 0, 0, imagecolorallocate($dst, 255, 255, 255));      // transparent PNGs land on white, not black
        imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);

        ob_start();
        $webp = function_exists('imagewebp');
        $webp ? imagewebp($dst, null, 82) : imagejpeg($dst, null, 84);
        $out = (string) ob_get_clean();

        return $out !== '' ? [$webp ? 'webp' : 'jpg', $out] : $fallback;
    }
}
