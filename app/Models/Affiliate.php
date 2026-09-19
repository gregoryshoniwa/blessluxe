<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Affiliate extends Model
{
    protected $table = 'affiliates';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];
    protected $casts = [
        'metadata'       => 'array',
        // Snapshot of where commission is paid, taken at application time.
        'payout_address' => 'array',
    ];

    /**
     * Codes that would be confusing or exploitable in a public URL.
     *
     * Share codes appear at /affiliate/shop/{code} and /affiliate/{code}/dashboard,
     * so anything reading like a BLESSLUXE page or an official account is out.
     */
    private const RESERVED = [
        'ADMIN', 'ADMINISTRATOR', 'BLESSLUXE', 'BLESS', 'LUXE', 'SHOP', 'STORE',
        'API', 'ACCOUNT', 'CHECKOUT', 'CART', 'TRACK', 'LOGIN', 'SIGNUP', 'HELP',
        'SUPPORT', 'OFFICIAL', 'TEAM', 'STAFF', 'ROOT', 'SYSTEM', 'NULL', 'UNDEFINED',
        'AFFILIATE', 'AFFILIATES', 'PACKS', 'SALE', 'NEW', 'ME', 'YOU', 'SHOWROOM',
    ];

    public const CODE_MIN = 3;
    public const CODE_MAX = 20;

    /**
     * Fold a typed code into its canonical form.
     *
     * Uppercase because codes get shared verbally and printed — "jane10" and
     * "JANE10" must never become two affiliates splitting one person's commission.
     */
    public static function normalizeCode(?string $code): string
    {
        return strtoupper(trim((string) $code));
    }

    /**
     * Why a code can't be used, or null when it's free.
     *
     * Returns the reason rather than a bool so the live availability check and
     * the server-side validation show the customer identical wording.
     */
    public static function codeUnavailableReason(?string $code, ?string $ignoreId = null): ?string
    {
        $code = self::normalizeCode($code);

        if ($code === '') return 'Pick a code.';
        if (strlen($code) < self::CODE_MIN) return 'Too short — at least ' . self::CODE_MIN . ' characters.';
        if (strlen($code) > self::CODE_MAX) return 'Too long — at most ' . self::CODE_MAX . ' characters.';
        if (! preg_match('/^[A-Z0-9][A-Z0-9_-]*[A-Z0-9]$/', $code)) {
            return 'Letters, numbers, dashes and underscores only, starting and ending with a letter or number.';
        }
        if (in_array($code, self::RESERVED, true)) return 'That one is reserved.';

        $taken = static::query()
            ->whereRaw('UPPER(code) = ?', [$code])
            ->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->exists();

        return $taken ? 'Already taken.' : null;
    }

    /** Alternatives in the spirit of what they typed, when their pick is gone. */
    public static function suggestCodes(?string $code, int $limit = 3): array
    {
        $base = substr(preg_replace('/[^A-Z0-9]/', '', self::normalizeCode($code)), 0, self::CODE_MAX - 2);
        if ($base === '') return [];

        $out = [];
        foreach (['X', date('y'), '1', '01', 'HQ', 'CO', 'ZW'] as $suffix) {
            if (count($out) >= $limit) break;
            $candidate = substr($base, 0, self::CODE_MAX - strlen($suffix)) . $suffix;
            if (self::codeUnavailableReason($candidate) === null && ! in_array($candidate, $out, true)) {
                $out[] = $candidate;
            }
        }

        return $out;
    }
}
