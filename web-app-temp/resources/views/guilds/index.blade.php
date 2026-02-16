@extends('layouts.app')

@section('content')
<div class="max-w-4xl mx-auto">
    <div class="flex justify-between items-end mb-8">
        <div>
            <h2 class="text-3xl font-bold text-white glow-text">Guild Lobby</h2>
            <p class="text-gray-400 mt-2">Select a Guild to Arise your Shadows (Deposit Liquidity).</p>
        </div>
        <button class="bg-crystal/10 hover:bg-crystal/20 text-crystal border border-crystal/50 px-4 py-2 rounded text-sm transition-all" onclick="window.location.reload()">
            ↻ Refresh Matrix
        </button>
    </div>

    <div class="grid gap-6">
        @forelse(\App\Models\Guild::all() as $guild)
        <div class="bg-shadow rounded-xl p-6 border border-gray-800 hover:border-crystal/50 transition-all group relative overflow-hidden">
            <!-- Progress Bar Background -->
            <div class="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-blue-900 to-crystal transition-all duration-1000" style="width: {{ ($guild->total_liquidity / $guild->max_capacity) * 100 }}%"></div>
            
            <div class="flex justify-between items-start relative z-10">
                <div>
                    <div class="flex items-center gap-3">
                        <h3 class="text-xl font-bold text-white group-hover:text-crystal transition-colors">{{ $guild->name }}</h3>
                        <span class="px-2 py-0.5 rounded text-[10px] bg-gray-800 border border-gray-700 text-gray-400 font-mono">{{ substr($guild->contract_address, 0, 8) }}...</span>
                    </div>
                    <div class="text-sm text-gray-500 mt-1">Asset: <span class="text-white font-semibold">{{ $guild->asset_symbol }}</span></div>
                </div>
                
                <div class="text-right">
                    <div class="text-2xl font-bold text-white font-mono">${{ number_format($guild->total_liquidity, 2) }}</div>
                    <div class="text-xs text-gray-500">/ ${{ number_format($guild->max_capacity, 0) }} Capacity</div>
                </div>
            </div>

            <div class="mt-6 flex justify-between items-center">
                <div class="flex -space-x-2">
                    <!-- Fake user avatars -->
                    <div class="w-8 h-8 rounded-full bg-gray-700 border-2 border-shadow"></div>
                    <div class="w-8 h-8 rounded-full bg-gray-600 border-2 border-shadow"></div>
                    <div class="w-8 h-8 rounded-full bg-gray-500 border-2 border-shadow flex items-center justify-center text-[10px] text-white">+{{ rand(10, 50) }}</div>
                </div>

                <button class="bg-white text-black hover:bg-crystal hover:text-white px-6 py-2 rounded font-bold text-sm transition-all shadow-[0_0_10px_rgba(255,255,255,0.2)]">
                    ARISE
                </button>
            </div>
        </div>
        @empty
        <div class="text-center py-20 bg-shadow/50 rounded-xl border border-gray-800 border-dashed">
            <p class="text-gray-500">No Guilds detected in the system.</p>
            <p class="text-xs text-gray-600 mt-2">Wait for the Monarch to deploy new contracts.</p>
        </div>
        @endforelse
    </div>
</div>
@endsection
