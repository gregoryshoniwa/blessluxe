<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Package extends Model
{
    protected $table = 'packages';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];
    protected $casts = [
        'is_pack'              => 'boolean',
        'estimated_delivery_at'=> 'datetime',
        'shipped_at'           => 'datetime',
        'delivered_at'         => 'datetime',
        'shipping_address'     => 'array',
        'metadata'             => 'array',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(PackageItem::class);
    }

    public function events(): HasMany
    {
        return $this->hasMany(PackageEvent::class)->orderBy('created_at');
    }
}
