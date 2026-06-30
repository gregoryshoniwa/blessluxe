<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ReturnItem extends Model
{
    protected $table = 'return_items';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];

    public function returnRequest(): BelongsTo
    {
        return $this->belongsTo(ReturnRequest::class, 'return_id');
    }

    public function lineItem(): BelongsTo
    {
        return $this->belongsTo(OrderLineItem::class, 'order_line_item_id');
    }
}
