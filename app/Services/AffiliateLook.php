<?php

namespace App\Services;

use App\Models\Affiliate;
use Illuminate\Support\Facades\DB;

/**
 * How an affiliate's shop LOOKS: accent colour, top-bar messages, hero slides.
 *
 * Everything an affiliate supplies ends up rendered on a BLESSLUXE-branded page
 * in front of shoppers, so this class is where their input is made safe and
 * sensible before it is stored:
 *
 *   - a colour is parsed from whatever they typed (#RGB, #RRGGBB, rgb()) and
 *     then nudged darker until white button text is readable on it. Someone
 *     WILL pick pale yellow, and a shop whose buttons can't be read can't sell.
 *   - a YouTube link is reduced to its 11-character id; the embed URL is built
 *     by us, never taken from them.
 *   - a button link must be a path on this site — not a way to send our
 *     shoppers somewhere else under our name.
 */
class AffiliateLook
{
    public const MAX_SLIDES = 5;
    public const MAX_MESSAGES = 5;
    public const MESSAGE_LENGTH = 60;
    /** Each render is a paid API call; this is per affiliate, per day. */
    public const AI_DAILY_LIMIT = 12;

    /** What a hero image should be, said once and used by the API + the UI. */
    public const HERO_GUIDE = [
        'ratio'        => '16:9',
        'recommended'  => '2400 × 1350 px',
        'minimum'      => '1600 × 900 px',
        'min_width'    => 1600,
        'min_height'   => 800,
        'max_mb'       => 8,
        'formats'      => 'JPG, PNG or WebP',
    ];

    /**
     * Twenty accents chosen to hold white text and sit well on the cream page.
     * First entry is the house gold, i.e. "no change".
     */
    public const PRESETS = [
        ['name' => 'BLESSLUXE Gold', 'hex' => '#C9A84C'],
        ['name' => 'Champagne',      'hex' => '#A8874C'],
        ['name' => 'Bronze',         'hex' => '#9C6B3F'],
        ['name' => 'Terracotta',     'hex' => '#C0623F'],
        ['name' => 'Coral',          'hex' => '#E0604F'],
        ['name' => 'Rose',           'hex' => '#D4577B'],
        ['name' => 'Blush Pink',     'hex' => '#D9738F'],
        ['name' => 'Fuchsia',        'hex' => '#C2338B'],
        ['name' => 'Berry',          'hex' => '#9B2C5E'],
        ['name' => 'Burgundy',       'hex' => '#7B1E3A'],
        ['name' => 'Plum',           'hex' => '#6D3B7C'],
        ['name' => 'Lavender',       'hex' => '#8E6BBF'],
        ['name' => 'Royal Blue',     'hex' => '#2F4FB5'],
        ['name' => 'Sky',            'hex' => '#2E8BC0'],
        ['name' => 'Teal',           'hex' => '#1F8A87'],
        ['name' => 'Emerald',        'hex' => '#1E7D57'],
        ['name' => 'Sage',           'hex' => '#6F8F6A'],
        ['name' => 'Olive',          'hex' => '#7A7A35'],
        ['name' => 'Charcoal',       'hex' => '#3A3A3F'],
        ['name' => 'Midnight',       'hex' => '#1B2340'],
    ];

    private const HOUSE = '#C9A84C';
    /** WCAG AA for large/bold text — what a button label is. */
    private const MIN_CONTRAST_ON_WHITE = 3.0;

    // ─── Colour ────────────────────────────────────────────────────────────

    /**
     * "#F0A", "#ff00aa", "FF00AA", "rgb(255, 0, 170)", "255,0,170" → "#FF00AA".
     * null when it isn't a colour.
     */
    public static function parseColor(?string $input): ?string
    {
        $s = trim((string) $input);
        if ($s === '') return null;

        if (preg_match('/^#?([0-9a-f]{3})$/i', $s, $m)) {
            [$r, $g, $b] = str_split($m[1]);
            return strtoupper("#$r$r$g$g$b$b");
        }
        if (preg_match('/^#?([0-9a-f]{6})$/i', $s, $m)) {
            return '#' . strtoupper($m[1]);
        }
        if (preg_match('/^(?:rgb\s*\()?\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)?$/i', $s, $m)) {
            $rgb = array_map('intval', [$m[1], $m[2], $m[3]]);
            if (max($rgb) > 255) return null;
            return sprintf('#%02X%02X%02X', ...$rgb);
        }

        return null;
    }

    /**
     * The colour actually used for a request. Same hue, but darkened (in small
     * steps) until white text reads on it — so what they see in the editor is
     * what shoppers get, and it is never an unreadable button.
     *
     * @return array{hex: string, adjusted: bool}
     */
    public static function usable(string $hex): array
    {
        $original = $hex;
        for ($i = 0; $i < 40 && self::contrastWithWhite($hex) < self::MIN_CONTRAST_ON_WHITE; $i++) {
            $hex = self::mix($hex, '#000000', 0.06);
        }

        return ['hex' => $hex, 'adjusted' => $hex !== $original];
    }

    /**
     * One accent → the five theme variables the storefront's CSS is built on.
     * Keys are the CSS custom property names, so the client applies them blind.
     */
    public static function palette(?string $hex): ?array
    {
        if (! $hex || strtoupper($hex) === self::HOUSE) return null;   // house look: override nothing

        return [
            '--color-gold'       => $hex,
            '--color-gold-dark'  => self::mix($hex, '#000000', 0.22),
            '--color-gold-light' => self::mix($hex, '#FFFFFF', 0.18),
            // The page's warm off-whites take a whisper of the accent, so the
            // whole shop shifts mood rather than just its buttons.
            '--color-cream-dark' => self::mix('#F5EDE3', $hex, 0.07),
            '--color-blush'      => self::mix('#F5E6E0', $hex, 0.10),
        ];
    }

    public static function contrastWithWhite(string $hex): float
    {
        return 1.05 / (self::luminance($hex) + 0.05);
    }

    private static function luminance(string $hex): float
    {
        $c = array_map(function ($v) {
            $v /= 255;
            return $v <= 0.03928 ? $v / 12.92 : (($v + 0.055) / 1.055) ** 2.4;
        }, self::rgb($hex));

        return 0.2126 * $c[0] + 0.7152 * $c[1] + 0.0722 * $c[2];
    }

    /** @return array{0:int,1:int,2:int} */
    private static function rgb(string $hex): array
    {
        return array_map('hexdec', str_split(ltrim($hex, '#'), 2));
    }

    /** $amount of $b mixed into $a (0 = all $a, 1 = all $b). */
    private static function mix(string $a, string $b, float $amount): string
    {
        [$ar, $ag, $ab] = self::rgb($a);
        [$br, $bg, $bb] = self::rgb($b);

        return sprintf('#%02X%02X%02X',
            (int) round($ar + ($br - $ar) * $amount),
            (int) round($ag + ($bg - $ag) * $amount),
            (int) round($ab + ($bb - $ab) * $amount),
        );
    }

    // ─── Links and video ───────────────────────────────────────────────────

    /**
     * The 11-character video id from any of YouTube's URL shapes, or null.
     * Only the id is ever stored; we build the embed URL ourselves.
     */
    public static function youtubeId(?string $input): ?string
    {
        $s = trim((string) $input);
        if (preg_match('/^[A-Za-z0-9_-]{11}$/', $s)) return $s;

        if (! preg_match('~^https?://(?:www\.|m\.|music\.)?(?:youtube\.com|youtube-nocookie\.com|youtu\.be)/~i', $s)) {
            return null;
        }
        if (preg_match('~(?:youtu\.be/|/embed/|/shorts/|/live/|[?&]v=)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])~', $s, $m)) {
            return $m[1];
        }

        return null;
    }

    /**
     * A button may only lead somewhere on this site. "//evil.com" and
     * "/\evil.com" both start with a slash and both leave it.
     */
    public static function internalPath(?string $href): ?string
    {
        $s = trim((string) $href);
        if ($s === '') return null;
        if (! preg_match('~^/(?![/\\\\])[A-Za-z0-9/_\-?=&%.+:]*$~', $s)) return null;

        return $s;
    }

    /** Trimmed, de-duplicated, length-capped top-bar lines. */
    public static function cleanMessages(array $lines): array
    {
        $out = [];
        foreach ($lines as $line) {
            if (! is_string($line)) continue;
            $line = trim(preg_replace('/\s+/u', ' ', strip_tags($line)));
            if ($line === '' || in_array(mb_strtolower($line), array_map('mb_strtolower', $out), true)) continue;
            $out[] = mb_substr($line, 0, self::MESSAGE_LENGTH);
            if (count($out) >= self::MAX_MESSAGES) break;
        }

        return $out;
    }

    // ─── What the storefront is given ──────────────────────────────────────

    /**
     * The look to draw for a shopper browsing this affiliate's shop. Each part
     * is null when the affiliate left it on the default — the storefront then
     * simply does what it always does.
     */
    public static function forStorefront(Affiliate $a): array
    {
        $messages = $a->top_bar_mode === 'custom'
            ? self::cleanMessages((array) (is_string($a->top_bar_messages) ? json_decode($a->top_bar_messages, true) : $a->top_bar_messages))
            : [];

        return [
            'theme'   => self::palette($a->theme_color),
            'top_bar' => $messages ?: null,
        ];
    }

    /**
     * Their active slides in the shape the hero already understands — or null
     * to mean "show BLESSLUXE's". Custom-but-empty falls back too: a shop must
     * never open on a blank hero because someone flipped a switch first.
     */
    public static function heroSlides(?Affiliate $a): ?array
    {
        if (! $a || $a->hero_mode !== 'custom') return null;

        $rows = DB::table('affiliate_hero_slides')
            ->where('affiliate_id', $a->id)->where('is_active', true)
            ->orderBy('position')->orderBy('created_at')
            ->limit(self::MAX_SLIDES)->get();

        return $rows->isEmpty() ? null : $rows->map(fn ($s) => self::slideShape($s))->all();
    }

    public static function slideShape(object $s): array
    {
        $yt = $s->media_type === 'youtube';

        return [
            'id'         => $s->id,
            'media_type' => $s->media_type,
            'media_url'  => $yt ? null : $s->media_url,
            'youtube_id' => $yt ? $s->media_url : null,
            // YouTube publishes a still for every video; it stands in until
            // (and unless) the player loads.
            'poster_url' => $yt ? "https://i.ytimg.com/vi/{$s->media_url}/maxresdefault.jpg" : null,
            'heading'    => $s->heading,
            'subheading' => $s->subheading,
            'cta_label'  => $s->cta_label,
            'cta_href'   => $s->cta_href,
            'focus'      => $s->focus,
            'source'     => $s->source,
            'is_active'  => (bool) $s->is_active,
            'position'   => (int) $s->position,
        ];
    }
}
