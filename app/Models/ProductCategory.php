<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ProductCategory extends Model
{
    protected $table = 'product_categories';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];

    public function parent(): BelongsTo
    {
        return $this->belongsTo(self::class, 'parent_category_id');
    }
}
