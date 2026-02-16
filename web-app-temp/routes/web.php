<?php

use Illuminate\Support\Facades\Route;
use App\Models\Guild;
use App\Models\Shadow;
use App\Models\RaidLog;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
*/

Route::get('/', function () {
    return view('dashboard');
});

Route::get('/guilds', function () {
    return view('guilds.index');
});

Route::get('/system', function () {
    // Just reuse dashboard for now or creating a specific log view
    return view('dashboard'); 
});

// Mock Route to seed data for testing if DB is empty
Route::get('/seed-test', function() {
    if(Guild::count() == 0) {
        Guild::create([
            'contract_address' => '0x' . Str::random(40),
            'name' => 'Shadow Igris',
            'asset_symbol' => 'USDC',
            'total_liquidity' => 450.50,
            'max_capacity' => 1000
        ]);
         Guild::create([
            'contract_address' => '0x' . Str::random(40),
            'name' => 'Shadow Tank',
            'asset_symbol' => 'USDT',
            'total_liquidity' => 120.00,
            'max_capacity' => 1000
        ]);
    }
    
    if(RaidLog::count() == 0 && Guild::first()) {
        RaidLog::create([
            'guild_id' => Guild::first()->id,
            'portal_color' => 'Blue', 
            'profit' => 12.50,
            'token_in' => 'USDC',
            'token_out' => 'USDT',
            'tx_hash' => '0x' . Str::random(64),
            'executed_at' => now()
        ]);
    }
    
    return redirect('/');
});
