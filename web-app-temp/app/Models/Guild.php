<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Guild extends Model
{
    use HasFactory;

    protected $fillable = [
        'contract_address',
        'name',
        'asset_symbol',
        'total_liquidity',
        'max_capacity',
        'is_active'
    ];

    public function shadows()
    {
        return $this->hasMany(Shadow::class);
    }

    public function raidLogs()
    {
        return $this->hasMany(RaidLog::class);
    }
}
