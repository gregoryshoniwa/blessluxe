<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Generation extends Model
{
    protected $table = 'generations';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];
    protected $casts = [
        'product_ids' => 'array',
        'meta'        => 'array',
    ];

    public function avatar(): BelongsTo
    {
        return $this->belongsTo(Avatar::class);
    }
}
