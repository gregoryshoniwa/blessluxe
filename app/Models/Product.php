<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Product extends Model
{
    protected $table = 'products';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];
    protected $casts = [
        'metadata' => 'array',
    ];

    public function variants(): HasMany
    {
        return $this->hasMany(ProductVariant::class);
    }

    public function images(): HasMany
    {
        return $this->hasMany(ProductImage::class)->orderBy('rank');
    }

    public function media(): HasMany
    {
        return $this->hasMany(ProductMedia::class)->orderBy('position');
    }

    public function options(): HasMany
    {
        return $this->hasMany(ProductOption::class)->orderBy('rank');
    }

    public function catalogues(): BelongsToMany
    {
        return $this->belongsToMany(Catalogue::class, 'product_catalogue_map', 'product_id', 'catalogue_id');
    }

    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(ProductCategory::class, 'product_category_map', 'product_id', 'category_id');
    }

    public function tags(): BelongsToMany
    {
        return $this->belongsToMany(ProductTag::class, 'product_tag_map', 'product_id', 'tag_id');
    }

    public function reviews(): HasMany
    {
        return $this->hasMany(ProductReview::class);
    }
}
