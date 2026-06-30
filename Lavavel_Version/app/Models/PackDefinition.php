<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class PackDefinition extends Model
{
    use SoftDeletes;

    protected $table = 'pack_definitions';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];

    public function legacyProduct(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'product_id');
    }

    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, 'pack_definition_product', 'pack_definition_id', 'product_id')
            ->withPivot('position')
            ->orderBy('pivot_position');
    }

    public function campaigns(): HasMany
    {
        return $this->hasMany(PackCampaign::class);
    }
}
