<?php

namespace App\Support;

use Illuminate\Support\Collection;

/**
 * Sizes in the order a shopper reads them: XS S M L XL, then numbers low to high.
 * Variants are often created in the same second, so their creation order is
 * no order at all — a size row of "S L M XS XL" is what that looked like.
 */
class Sizes
{
    private const LETTERS = ['XXXS' => 1, '3XS' => 1, 'XXS' => 2, '2XS' => 2, 'XS' => 3, 'S' => 4, 'M' => 5, 'L' => 6, 'XL' => 7, 'XXL' => 8, '2XL' => 8, 'XXXL' => 9, '3XL' => 9, '4XL' => 10, '5XL' => 11];

    /** A sortable key: [group, value]. Letters first, then numbers, then anything else as it came. */
    public static function rank(?string $title): array
    {
        $t = strtoupper(trim((string) $title));
        $first = preg_split('~\s*[/\-–|,]\s*|\s+~', $t)[0] ?? $t;     // "M / Green" → "M", "S-M" → "S"
        if (isset(self::LETTERS[$first])) return [0, self::LETTERS[$first]];
        if (in_array($first, ['ONE SIZE', 'OS', 'FREE'], true) || str_starts_with($t, 'ONE SIZE')) return [0, 0];
        if (preg_match('~^(\d+(?:\.\d+)?)~', $t, $m)) return [1, (float) $m[1]];                 // 8, 10, 32/34, 44-50, 3Y

        return [2, 0];
    }

    /** Stable: equal ranks keep their original order. */
    public static function sort(Collection $variants, string $field = 'title'): Collection
    {
        return $variants->values()
            ->map(fn ($v, $i) => [$v, self::rank(data_get($v, $field)), $i])
            ->sort(fn ($a, $b) => [$a[1][0], $a[1][1], $a[2]] <=> [$b[1][0], $b[1][1], $b[2]])
            ->map(fn ($r) => $r[0])
            ->values();
    }
}
