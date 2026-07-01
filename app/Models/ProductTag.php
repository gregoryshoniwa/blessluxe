<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class ProductTag extends Model
{
    public $timestamps = false;
    protected $table = 'product_tags';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];
}
