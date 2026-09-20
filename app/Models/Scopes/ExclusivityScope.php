<?php

namespace App\Models\Scopes;

use App\Models\Affiliate;
use App\Services\Exclusivity;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Scope;

/**
 * Hides products another affiliate currently holds exclusively.
 *
 * Deliberately a GLOBAL scope rather than something each query opts into. A
 * storefront query that forgot to filter would show — and sell — a product
 * somebody has paid to have exclusively, which is the exact failure this
 * feature must not have. Admin screens opt OUT explicitly with
 * `withoutGlobalScope(ExclusivityScope::class)`, so a forgotten call there
 * merely hides a row from staff rather than breaking a paid agreement.
 */
class ExclusivityScope implements Scope
{
    /** Resolved once per request — this scope runs on every product query. */
    private static ?array $hiddenCache = null;
    private static bool $resolved = false;

    public function apply(Builder $builder, Model $model): void
    {
        $hidden = self::hidden();
        if ($hidden) {
            $builder->whereNotIn($model->getTable() . '.id', $hidden);
        }
    }

    /** @return array<int,string> */
    private static function hidden(): array
    {
        if (self::$resolved) return self::$hiddenCache ?? [];

        self::$resolved = true;

        try {
            // The affiliate whose storefront is being browsed, if any — their own
            // exclusives must stay visible to them.
            $code = app('request')->hasSession()
                ? app('request')->session()->get('affiliate_code')
                : null;

            $viewer = $code
                ? Affiliate::where('code', $code)->where('status', 'active')->first()
                : null;

            self::$hiddenCache = Exclusivity::hiddenProductIds($viewer);
        } catch (\Throwable) {
            // Never let this break a page: showing everything is a better failure
            // than a 500, and admin can revoke a bad exclusivity by hand.
            self::$hiddenCache = [];
        }

        return self::$hiddenCache ?? [];
    }

    /** Tests and long-running processes need to clear the per-request memo. */
    public static function flush(): void
    {
        self::$hiddenCache = null;
        self::$resolved = false;
    }
}
