<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudioItem extends Model
{
    protected $table = 'studio_items';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];
    protected $casts = [
        'meta' => 'array',
    ];

    public function logo(): BelongsTo
    {
        return $this->belongsTo(Logo::class);
    }

    public function customerProduct(): BelongsTo
    {
        return $this->belongsTo(CustomerProduct::class);
    }
}
