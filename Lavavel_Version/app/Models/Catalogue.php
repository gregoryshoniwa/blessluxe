<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Catalogue extends Model
{
    protected $table = 'catalogues';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];
    protected $casts = [
        'is_active' => 'boolean',
        'metadata'  => 'array',
    ];

    public function heading(): BelongsTo
    {
        return $this->belongsTo(Heading::class);
    }

    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, 'product_catalogue_map', 'catalogue_id', 'product_id');
    }
}
