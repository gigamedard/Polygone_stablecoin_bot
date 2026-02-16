<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Shadow extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_wallet_address',
        'guild_id',
        'name',
        'rank',
        'amount',
        'shares'
    ];

    public function guild()
    {
        return $this->belongsTo(Guild::class);
    }
}
