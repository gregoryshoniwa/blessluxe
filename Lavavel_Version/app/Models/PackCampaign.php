<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;

class PackCampaign extends Model
{
    use SoftDeletes;

    protected $table = 'pack_campaigns';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];
    protected $casts = [
        'expires_at' => 'datetime',
    ];

    public function definition(): BelongsTo
    {
        return $this->belongsTo(PackDefinition::class, 'pack_definition_id');
    }

    public function affiliate(): BelongsTo
    {
        return $this->belongsTo(Affiliate::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function slots(): HasMany
    {
        return $this->hasMany(PackSlot::class);
    }
}
