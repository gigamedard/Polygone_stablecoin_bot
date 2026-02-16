<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\GameApiController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

Route::prefix('bot')->group(function () {
    Route::post('/raid-success', [GameApiController::class, 'raidSuccess']);
    Route::post('/sync-guild', [GameApiController::class, 'syncGuild']);
    Route::get('/active-guilds', [GameApiController::class, 'getActiveGuilds']);
});
