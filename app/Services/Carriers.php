<?php

namespace App\Services;

use Illuminate\Support\Str;

/**
 * Reads config/carriers.php.
 *
 * The registry is a convenience, not a constraint: `packages.carrier` stays free
 * text (it already holds historical values typed by admins), so every method here
 * degrades gracefully for a key it has never seen.
 */
class Carriers
{
    /** @return array<string,array{label:string,url:?string}> */
    public static function all(): array
    {
        return config('carriers', []);
    }

    /**
     * Human-readable carrier name.
     *
     * An unknown key is title-cased rather than dropped — an admin who typed
     * "city_link" should see "City Link", not a blank field.
     */
    public static function label(?string $key): ?string
    {
        $key = trim((string) $key);
        if ($key === '') return null;

        return self::all()[strtolower($key)]['label']
            ?? Str::title(str_replace(['_', '-'], ' ', $key));
    }

    /**
     * Deep link to the carrier's own tracking page, or null when we can't build one.
     *
     * Null whenever the carrier is unknown, has no template, or there is no tracking
     * number — callers render a plain number in that case. Never emit a link
     * containing a literal "{n}" or a null.
     */
    public static function trackingUrl(?string $key, ?string $number): ?string
    {
        $key    = strtolower(trim((string) $key));
        $number = trim((string) $number);
        if ($key === '' || $number === '') return null;

        $template = self::all()[$key]['url'] ?? null;
        if (! $template) return null;

        return str_replace('{n}', rawurlencode($number), $template);
    }

    /** True when this carrier can produce a clickable link. */
    public static function hasTracking(?string $key): bool
    {
        return (bool) (self::all()[strtolower(trim((string) $key))]['url'] ?? null);
    }

    /** Shape for the admin <select>. Free text stays available behind an "Other…" option. */
    public static function options(): array
    {
        $out = [];
        foreach (self::all() as $key => $meta) {
            $out[] = [
                'value'   => $key,
                'label'   => $meta['label'],
                'has_url' => (bool) ($meta['url'] ?? null),
            ];
        }
        return $out;
    }

    /**
     * The three carrier fields every API payload should expose together, so no
     * caller has to remember to build the URL itself.
     */
    public static function payload(?string $key, ?string $number): array
    {
        return [
            'carrier'                 => $key ?: null,
            'carrier_label'           => self::label($key),
            'carrier_tracking_number' => $number ?: null,
            'carrier_tracking_url'    => self::trackingUrl($key, $number),
        ];
    }
}
