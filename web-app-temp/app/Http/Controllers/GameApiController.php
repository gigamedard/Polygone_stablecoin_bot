<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\Guild;
use App\Models\RaidLog;
use Carbon\Carbon;

class GameApiController extends Controller
{
    // Receive Raid Success from Bot
    public function raidSuccess(Request $request)
    {
        $validated = $request->validate([
            'guild_address' => 'required|string',
            'profit' => 'required|numeric',
            'token_in' => 'required|string',
            'token_out' => 'required|string',
            'tx_hash' => 'nullable|string',
            'portal_color' => 'required|string'
        ]);

        $guild = Guild::where('contract_address', $validated['guild_address'])->firstOrFail();

        // Log Raid
        RaidLog::create([
            'guild_id' => $guild->id,
            'profit' => $validated['profit'],
            'token_in' => $validated['token_in'],
            'token_out' => $validated['token_out'],
            'portal_color' => $validated['portal_color'],
            'tx_hash' => $validated['tx_hash'],
            'executed_at' => Carbon::now(),
        ]);

        // Update Guild Liquidity (Simulated auto-compound)
        $guild->total_liquidity += $validated['profit'];
        $guild->save();

        return response()->json(['message' => 'Raid Logged Successfully', 'new_liquidity' => $guild->total_liquidity]);
    }

    // Sync Guild Data (e.g. from Factory events or periodic check)
    public function syncGuild(Request $request)
    {
        $validated = $request->validate([
            'contract_address' => 'required|string',
            'name' => 'required|string',
            'asset' => 'required|string',
            'curr_liquidity' => 'numeric'
        ]);

        $guild = Guild::updateOrCreate(
            ['contract_address' => $validated['contract_address']],
            [
                'name' => $validated['name'],
                'asset_symbol' => $validated['asset'],
                'total_liquidity' => $validated['curr_liquidity'] ?? 0
            ]
        );

        return response()->json(['message' => 'Guild Synced', 'guild' => $guild]);
    }
    
    // Get Active Guilds for Bot to listen to
    public function getActiveGuilds()
    {
        return response()->json(Guild::where('is_active', true)->get());
    }
}
