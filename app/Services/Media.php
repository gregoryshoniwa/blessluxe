<?php

namespace App\Services;

use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * The one door every uploaded or generated file goes through.
 *
 * Before this, twelve controllers each wrote to the server's own disk in one of
 * two ways (`public_path('ai/…')`, or the `public` storage disk). That works on
 * a laptop and quietly loses every file on Laravel Cloud, whose disk is rebuilt
 * on each deploy. Routing everything through here means WHERE files live is a
 * single setting (config/media.php) and no controller knows or cares.
 *
 * Vocabulary:
 *   key   where a file sits on the media disk:  "products/ab12.jpg"
 *   url   what is saved in the database and given to a browser. Locally that is
 *         "/storage/products/ab12.jpg"; on a bucket it is a full https:// URL.
 *
 * Callers store the URL and hand the URL back for every later operation —
 * `Media::delete($product->thumbnail)` — so they never deal in keys. That also
 * keeps OLD rows working: a URL saved before the move ("/ai/logos/x.png",
 * "/storage/…") is understood, and looked for on the old local disk too.
 */
class Media
{
    public static function disk(): Filesystem
    {
        return Storage::disk(self::diskName());
    }

    /**
     * Which disk media lives on — worked out, not just read.
     *
     * Laravel Cloud lets whoever attaches a bucket type ANY disk name, and it
     * can even reuse the name "public", replacing the local disk of that name.
     * A setting that has to match that exactly is a setting that will one day
     * not match — and then every upload in production fails. So:
     *
     *   1. MEDIA_DISK, if it names a disk that actually exists
     *   2. otherwise the app's DEFAULT disk, when that is a bucket — which is
     *      what Laravel Cloud makes of the first bucket attached
     *   3. otherwise the local `public` disk (development)
     *
     * Resolved at call time, because Laravel Cloud injects its disks while the
     * app boots — after config/media.php has already been read.
     */
    public static function diskName(): string
    {
        $wanted = config('media.disk');
        if ($wanted && $wanted !== 'public' && config("filesystems.disks.$wanted.driver")) {
            return $wanted;
        }

        $default = config('filesystems.default');
        if ($default && self::driverIsRemote(config("filesystems.disks.$default.driver"))) {
            return $default;
        }

        return 'public';
    }

    /** True when files go to a bucket rather than this machine's disk. */
    public static function isRemote(): bool
    {
        return self::driverIsRemote(config('filesystems.disks.' . self::diskName() . '.driver'));
    }

    private static function driverIsRemote(?string $driver): bool
    {
        return ! in_array($driver, ['local', 'scoped', null], true);
    }

    // ─── Writing ───────────────────────────────────────────────────────────

    /**
     * The only extensions a stored file can ever have, keyed by the type found
     * in its BYTES. Deliberately an allow-list: the uploader's filename is never
     * consulted, and neither is a "guess" — a guess for an image named
     * "photo.php" came back as "php". Anything not listed is saved as `.bin`,
     * which no server will execute and no browser will render.
     */
    private const EXTENSIONS = [
        'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp', 'image/gif' => 'gif', 'image/avif' => 'avif',
        'video/mp4' => 'mp4', 'video/webm' => 'webm', 'video/quicktime' => 'mov',
    ];

    /** Store an upload; returns the URL to save. */
    public static function upload(UploadedFile $file, string $dir): string
    {
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($file->getRealPath()) ?: '';
        $key = trim($dir, '/') . '/' . Str::random(32) . '.' . (self::EXTENSIONS[$mime] ?? 'bin');

        // No visibility flag: R2 governs that per bucket and rejects the option.
        $stream = fopen($file->getRealPath(), 'r');
        try {
            self::disk()->put($key, $stream);
        } finally {
            if (is_resource($stream)) fclose($stream);
        }

        return self::url($key);
    }

    /** Store raw bytes (an AI render); returns the URL to save. */
    public static function put(string $dir, string $extension, string $bytes): string
    {
        $key = trim($dir, '/') . '/' . Str::uuid() . '.' . ltrim($extension, '.');
        self::disk()->put($key, $bytes);

        return self::url($key);
    }

    /** Store a base64 image as returned by the image model. */
    public static function putRender(string $dir, array $result): string
    {
        $mime = (string) ($result['mime'] ?? 'image/png');
        $ext = str_contains($mime, 'webp') ? 'webp' : (str_contains($mime, 'jpeg') ? 'jpg' : 'png');

        return self::put($dir, $ext, base64_decode((string) ($result['base64'] ?? '')));
    }

    // ─── Addressing ────────────────────────────────────────────────────────

    public static function url(string $key): string
    {
        $key = ltrim($key, '/');
        if ($base = config('media.url')) return rtrim($base, '/') . '/' . $key;

        $url = self::disk()->url($key);

        // A file on THIS machine is saved host-less ("/storage/products/x.jpg"),
        // exactly as the app always has. Laravel would otherwise bake APP_URL in,
        // and every saved row would break the day the site's address changes —
        // or the moment a database made on a laptop is opened anywhere else.
        if (! self::isRemote()) {
            return parse_url($url, PHP_URL_PATH) ?: '/' . $key;
        }

        return $url;
    }

    /**
     * The key behind a URL we issued — or null if it isn't ours.
     *
     * "Isn't ours" is a security answer, not just a convenience: several
     * endpoints accept a URL from the browser (an AI render to keep, a file to
     * delete), and anything that doesn't resolve to a key on OUR disk — another
     * site, a path with "..", "/.env" — must come back null.
     */
    public static function key(?string $url): ?string
    {
        $url = trim((string) $url);
        if ($url === '' || str_contains($url, '..') || str_contains($url, "\0")) return null;

        $path = null;
        foreach (array_filter([config('media.url'), self::baseUrl()]) as $base) {
            $base = rtrim($base, '/') . '/';
            if (str_starts_with($url, $base)) { $path = substr($url, strlen($base)); break; }
        }

        if ($path === null) {
            if (preg_match('~^https?://~i', $url)) return null;          // someone else's URL
            $path = ltrim($url, '/');
            // The local `public` disk is served under /storage.
            if (str_starts_with($path, 'storage/')) $path = substr($path, 8);
        }

        $path = ltrim(strtok($path, '?#') ?: '', '/');

        return preg_match('~^[A-Za-z0-9/_\-.]+$~', $path) ? $path : null;
    }

    private static function baseUrl(): ?string
    {
        try {
            return rtrim(self::disk()->url(''), '/');
        } catch (\Throwable) {
            return null;
        }
    }

    // ─── Reading and removing (all take the stored URL) ────────────────────

    public static function exists(?string $url): bool
    {
        $key = self::key($url);
        if (! $key) return false;

        return self::disk()->exists($key) || self::legacyPath($url) !== null;
    }

    public static function get(?string $url): ?string
    {
        $key = self::key($url);
        if (! $key) return null;
        if (self::disk()->exists($key)) return self::disk()->get($key);

        $legacy = self::legacyPath($url);

        return $legacy ? file_get_contents($legacy) : null;
    }

    /** {base64, mime} for handing an existing image to the image model. */
    public static function asReference(?string $url): ?array
    {
        $bytes = self::get($url);
        if ($bytes === null || $bytes === '') return null;

        $mime = (new \finfo(FILEINFO_MIME_TYPE))->buffer($bytes) ?: '';
        if (! str_starts_with($mime, 'image/')) return null;

        return ['base64' => base64_encode($bytes), 'mime' => $mime];
    }

    public static function delete(?string $url): void
    {
        $key = self::key($url);
        if (! $key) return;

        try {
            self::disk()->delete($key);
        } catch (\Throwable) { /* already gone */ }

        if ($legacy = self::legacyPath($url)) @unlink($legacy);
    }

    /** True when $url is one of ours AND sits under $dir — e.g. one affiliate's own folder. */
    public static function isUnder(?string $url, string $dir): bool
    {
        $key = self::key($url);

        return $key !== null && str_starts_with($key, trim($dir, '/') . '/');
    }

    /**
     * Where a file written BEFORE the move still sits on this machine: directly
     * under public/ ("/ai/…", "/uploads/…"). Only ever those two folders.
     */
    private static function legacyPath(?string $url): ?string
    {
        $path = ltrim((string) parse_url((string) $url, PHP_URL_PATH), '/');
        if (! preg_match('~^(ai|uploads)/[A-Za-z0-9/_\-.]+$~', $path) || str_contains($path, '..')) return null;

        $abs = public_path($path);

        return is_file($abs) ? $abs : null;
    }
}
