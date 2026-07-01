<?php

namespace App\Services\AI;

use Illuminate\Support\Facades\DB;

/**
 * Cheap, rules-based preference extraction off the customer's turn.
 *
 * Real version would call Gemini in JSON mode and merge structured output.
 * This pass catches colours, common sizes, budget keywords — enough to
 * seed the CUSTOMER PROFILE block on the next turn without an extra
 * round-trip.
 */
class PreferenceLearner
{
    private const COLOURS = ['black','white','cream','beige','gold','blush','pink','red','blue','navy','green','olive','grey','silver','brown','tan'];
    private const STYLES  = ['casual','formal','bohemian','minimal','elegant','sporty','classic','edgy','romantic','vintage','streetwear'];
    private const SIZES   = ['xxs','xs','s','m','l','xl','xxl'];

    public function learnFromTurn(string $customerId, string $userText): void
    {
        $lower = strtolower($userText);
        $updates = [];

        $hits = array_values(array_filter(self::COLOURS, fn ($c) => str_contains($lower, $c)));
        if ($hits) $updates['favorite_colors'] = $hits;

        $styles = array_values(array_filter(self::STYLES, fn ($s) => str_contains($lower, $s)));
        if ($styles) $updates['favorite_styles'] = $styles;

        // Budget — match "under $200", "around 150", "max 300".
        if (preg_match('/\b(?:under|less than|max|maximum|around|about)\s*\$?(\d{2,4})/', $lower, $m)) {
            $updates['budget_max'] = (int) $m[1] * 100;
        }
        if (preg_match('/\b(?:over|more than|at least)\s*\$?(\d{2,4})/', $lower, $m)) {
            $updates['budget_min'] = (int) $m[1] * 100;
        }

        // Size — match "size m", "size 8".
        if (preg_match('/\bsize\s+(xxs|xs|s|m|l|xl|xxl|\d{1,2})\b/', $lower, $m)) {
            $size = strtoupper($m[1]);
            // No way to tell from one mention if it's a top/dress/bottom — store as top_size by default.
            $updates['top_size'] = $size;
        }

        if (! $updates) return;
        $this->merge($customerId, $updates);
    }

    private function merge(string $customerId, array $updates): void
    {
        $row = DB::table('ai_customer_preferences')->where('customer_id', $customerId)->first();
        $now = now();
        if (! $row) {
            DB::table('ai_customer_preferences')->insert(array_merge([
                'customer_id' => $customerId,
                'created_at'  => $now,
                'updated_at'  => $now,
            ], $this->encode($updates)));
            return;
        }
        // Merge array columns with existing values.
        $merged = $this->encode($updates);
        foreach (['favorite_colors', 'favorite_styles', 'preferred_fits', 'avoided_styles'] as $arrCol) {
            if (isset($updates[$arrCol]) && $row->{$arrCol}) {
                $existing = json_decode($row->{$arrCol}, true) ?? [];
                $merged[$arrCol] = json_encode(array_values(array_unique(array_merge($existing, $updates[$arrCol]))));
            }
        }
        $merged['updated_at'] = $now;
        DB::table('ai_customer_preferences')->where('customer_id', $customerId)->update($merged);
    }

    private function encode(array $updates): array
    {
        $out = [];
        foreach ($updates as $k => $v) {
            $out[$k] = is_array($v) ? json_encode(array_values(array_unique($v))) : $v;
        }
        return $out;
    }
}
