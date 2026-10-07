<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Supplier extends Model
{
    protected $table = 'suppliers';
    protected $keyType = 'string';
    public $incrementing = false;
    protected $guarded = [];
}
