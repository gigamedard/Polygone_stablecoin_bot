@extends('layouts.app')

@section('content')
<div class="grid grid-cols-1 md:grid-cols-3 gap-6">

    <!-- Player Stats -->
    <div class="col-span-3 bg-shadow rounded-xl p-6 border border-gray-800 relative overflow-hidden">
        <div class="absolute top-0 right-0 w-64 h-64 bg-crystal opacity-5 rounded-full blur-3xl -mr-16 -mt-16"></div>
        <h2 class="text-2xl font-bold mb-4 glow-text">Status Window</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="p-4 bg-void/50 rounded-lg border border-gray-800">
                <div class="text-gray-500 text-xs uppercase tracking-widest">Total Active Shadows</div>
                <div class="text-3xl font-bold text-white mt-1">{{ \App\Models\Shadow::count() }}</div>
            </div>
            <div class="p-4 bg-void/50 rounded-lg border border-gray-800">
                <div class="text-gray-500 text-xs uppercase tracking-widest">Total Crystals (Profit)</div>
                <div class="text-3xl font-bold text-crystal mt-1">$ {{ number_format(\App\Models\RaidLog::sum('profit'), 2) }}</div>
            </div>
             <div class="p-4 bg-void/50 rounded-lg border border-gray-800">
                <div class="text-gray-500 text-xs uppercase tracking-widest">Active Guilds</div>
                <div class="text-3xl font-bold text-white mt-1">{{ \App\Models\Guild::count() }}</div>
            </div>
             <div class="p-4 bg-void/50 rounded-lg border border-gray-800">
                <div class="text-gray-500 text-xs uppercase tracking-widest">Rank</div>
                <div class="text-3xl font-bold text-rank-S mt-1">S-Class</div>
            </div>
        </div>
    </div>

    <!-- My Shadows (Investments) -->
    <div class="col-span-2 bg-shadow rounded-xl p-6 border border-gray-800">
        <h3 class="text-lg font-bold mb-4 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-purple-500"></span> My Shadow Army
        </h3>
        
        <div class="overflow-x-auto">
            <table class="w-full text-left text-sm">
                <thead>
                    <tr class="text-gray-500 border-b border-gray-800">
                        <th class="pb-3">Name</th>
                        <th class="pb-3">Guild</th>
                        <th class="pb-3">Rank</th>
                        <th class="pb-3 text-right">Amount</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-gray-800/50">
                    @forelse(\App\Models\Shadow::latest()->take(5)->get() as $shadow)
                    <tr class="group hover:bg-white/5 transition-colors">
                        <td class="py-3 font-medium text-white">{{ $shadow->name }}</td>
                        <td class="py-3 text-gray-400">{{ $shadow->guild->name ?? 'Unknown' }}</td>
                        <td class="py-3">
                            <span class="px-2 py-0.5 rounded text-xs bg-rank-{{ $shadow->rank }}/20 text-rank-{{ $shadow->rank }}">
                                {{ $shadow->rank }}
                            </span>
                        </td>
                        <td class="py-3 text-right font-mono text-crystal">$ {{ number_format($shadow->amount, 2) }}</td>
                    </tr>
                    @empty
                    <tr>
                        <td colspan="4" class="py-8 text-center text-gray-600 italic">No Shadows Arised yet. Head to the Guild Lobby.</td>
                    </tr>
                    @endforelse
                </tbody>
            </table>
        </div>
    </div>

    <!-- System Log (Running Text) -->
    <div class="bg-shadow rounded-xl p-6 border border-gray-800 h-96 flex flex-col">
        <h3 class="text-lg font-bold mb-4 text-red-500 tracking-widest uppercase text-xs">System Notifications</h3>
        <div class="flex-grow overflow-y-auto space-y-3 pr-2 scrollbar-thin scrollbar-thumb-gray-800 text-xs font-mono">
             @foreach(\App\Models\RaidLog::latest()->take(20)->get() as $log)
                <div class="p-3 rounded border-l-2 bg-void/30 border-{{ strtolower($log->portal_color) == 'blue' ? 'blue-500' : 'red-500' }}">
                    <div class="flex justify-between text-gray-500 mb-1">
                        <span>{{ $log->executed_at->format('H:i:s') }}</span>
                        <span>{{ $log->portal_color }} GATE</span>
                    </div>
                    <div class="text-gray-300">
                        Raid successful in <span class="text-white">{{ $log->guild->name }}</span>.
                        <div class="text-crystal mt-1">+ ${{ number_format($log->profit, 4) }} ({{ $log->token_in }} -> {{ $log->token_out }})</div>
                    </div>
                </div>
             @endforeach
             <div class="text-center text-gray-600 py-2">--- System initialized ---</div>
        </div>
    </div>

</div>
@endsection
