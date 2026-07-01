<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AffiliatePayout extends Model
{
    protected $table = 'affiliate_payouts';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];
    protected $casts = ['metadata' => 'array'];

    public function affiliate(): BelongsTo
    {
        return $this->belongsTo(Affiliate::class);
    }
}
