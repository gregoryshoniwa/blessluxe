<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * The pictures on the home page's "Shop by department" tiles. A tile with
 * several pictures cross-fades between them; one with none falls back to
 * the heading's own image (or, for Series and the Hive, a real photo of one).
 *
 * Tiles are keyed `series`, `hive` and `heading:{id}`. Every URL stored here is
 * one of OUR files (Media) — nothing typed into a box ever reaches an <img>.
 */
class HomeTiles
{
    public const KEY = 'home.tiles';
    public const MAX = 6;

    /** @return array<string, string[]> */
    public static function all(): array
    {
        $raw = json_decode((string) DB::table('settings')->where('key', self::KEY)->value('value'), true);
        $raw = is_array($raw) ? $raw : [];

        $out = [];
        foreach ($raw as $key => $urls) {
            if (! self::validKey((string) $key) || ! is_array($urls)) continue;
            $urls = array_values(array_filter($urls, fn ($u) => is_string($u) && Media::key($u) !== null));
            if ($urls) $out[$key] = array_slice($urls, 0, self::MAX);
        }

        return $out;
    }

    /** Every tile staff can dress, in the order the home page shows them. */
    public static function forAdmin(): array
    {
        $images = self::all();
        $tiles = [
            ['key' => 'series', 'label' => 'Series', 'hint' => 'The first tile, until the Hive is launched'],
            ['key' => 'hive',   'label' => 'The Hive', 'hint' => 'Takes the first tile once the Hive is shown in the menu'],
        ];
        $headings = DB::table('headings')->where('is_active', true)->where('is_sale', false)->orderBy('rank')->get(['id', 'name', 'image_url']);
        foreach ($headings as $h) {
            $tiles[] = ['key' => 'heading:' . $h->id, 'label' => $h->name, 'hint' => $h->image_url ? 'Without pictures here, the heading\'s own image is shown' : 'Department tile'];
        }

        return array_map(fn ($t) => $t + ['images' => $images[$t['key']] ?? []], $tiles);
    }

    public static function add(string $key, string $url): bool
    {
        if (! self::validKey($key)) return false;
        $all = self::all();
        if (count($all[$key] ?? []) >= self::MAX) return false;
        $all[$key][] = $url;

        return self::save($all);
    }

    /** Re-order or remove — only URLs already on the tile are kept, so nothing new can arrive this way. */
    public static function set(string $key, array $urls): array
    {
        $all = self::all();
        $had = $all[$key] ?? [];
        $next = array_values(array_unique(array_filter($urls, fn ($u) => in_array($u, $had, true))));
        if ($next) $all[$key] = $next; else unset($all[$key]);
        self::save($all);

        return array_values(array_diff($had, $next));     // the files nobody shows any more
    }

    public static function validKey(string $key): bool
    {
        if ($key === 'series' || $key === 'hive') return true;

        return str_starts_with($key, 'heading:') && DB::table('headings')->where('id', substr($key, 8))->exists();
    }

    private static function save(array $all): bool
    {
        DB::table('settings')->updateOrInsert(['key' => self::KEY], ['value' => json_encode($all), 'updated_at' => now()]);

        return true;
    }
}
