<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AiConversation extends Model
{
    protected $table = 'ai_conversations';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];
    protected $casts = [
        'topics'             => 'array',
        'products_discussed' => 'array',
        'started_at'         => 'datetime',
        'ended_at'           => 'datetime',
    ];
}
