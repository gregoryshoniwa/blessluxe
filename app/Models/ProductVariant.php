<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ProductVariant extends Model
{
    protected $table = 'product_variants';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];
    protected $casts = [
        'manage_inventory' => 'boolean',
        'allow_backorder'  => 'boolean',
        'received_at'      => 'datetime',
        'metadata'         => 'array',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function prices(): HasMany
    {
        return $this->hasMany(VariantPrice::class, 'variant_id');
    }
}
