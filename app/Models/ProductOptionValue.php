<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ProductOptionValue extends Model
{
    public $timestamps = false;
    protected $table = 'product_option_values';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];

    public function option(): BelongsTo
    {
        return $this->belongsTo(ProductOption::class, 'option_id');
    }
}
