<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiUsageLog extends Model
{
    protected $table = 'ai_usage_logs';
    protected $guarded = [];
    public $timestamps = false;
    protected $casts = [
        'meta'  => 'array',
        'units' => 'float',
        'cost'  => 'float',
        'created_at' => 'datetime',
    ];
}
