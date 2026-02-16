<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class RaidLog extends Model
{
    use HasFactory;

    protected $fillable = [
        'guild_id',
        'portal_color',
        'profit',
        'token_in',
        'token_out',
        'tx_hash',
        'executed_at'
    ];

    protected $casts = [
        'executed_at' => 'datetime',
    ];

    public function guild()
    {
        return $this->belongsTo(Guild::class);
    }
}
