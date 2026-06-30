<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class PackSlot extends Model
{
    use SoftDeletes;

    protected $table = 'pack_slots';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];
    protected $casts = [
        'reserved_until' => 'datetime',
    ];

    public function campaign(): BelongsTo
    {
        return $this->belongsTo(PackCampaign::class, 'pack_campaign_id');
    }

    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'variant_id');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    /** A reservation is live when status=reserved AND reserved_until > now(). */
    public function isLive(): bool
    {
        return $this->status === 'reserved' && $this->reserved_until && $this->reserved_until->isFuture();
    }
}
