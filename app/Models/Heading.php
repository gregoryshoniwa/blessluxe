<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Heading extends Model
{
    protected $table = 'headings';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];
    protected $casts = [
        'is_active' => 'boolean',
        'is_sale'   => 'boolean',
        'metadata'  => 'array',
    ];

    public function catalogues(): HasMany
    {
        return $this->hasMany(Catalogue::class)->orderBy('rank');
    }
}
