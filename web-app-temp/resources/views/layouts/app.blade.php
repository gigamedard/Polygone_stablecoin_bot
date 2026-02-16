<!DOCTYPE html>
<html lang="en" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Shadow Monarch - GameFi</title>
    
    <!-- Tailwind CSS (CDN for fast prototyping) -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        void: '#0a0a0a',
                        shadow: '#1a1a1a',
                        crystal: '#4a9eff',
                        rank: {
                            'E': '#a3a3a3',
                            'D': '#10b981',
                            'C': '#3b82f6',
                            'B': '#8b5cf6',
                            'A': '#f59e0b',
                            'S': '#ef4444'
                        }
                    },
                    fontFamily: {
                        sans: ['Inter', 'sans-serif'],
                    }
                }
            }
        }
    </script>
    <!-- Alpine.js for interactivity -->
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
    
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
        body { font-family: 'Inter', sans-serif; background-color: #0a0a0a; color: #e5e5e5; }
        .glow-text { text-shadow: 0 0 10px rgba(74, 158, 255, 0.5); }
    </style>
</head>
<body class="bg-void text-gray-200 min-h-screen flex flex-col">

    <!-- Navigation -->
    <nav class="bg-shadow border-b border-gray-800 p-4 sticky top-0 z-50">
        <div class="container mx-auto flex justify-between items-center">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 bg-crystal rounded-full shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
                <h1 class="text-xl font-bold tracking-wider text-white">SHADOW MONARCH</h1>
            </div>
            <div class="flex gap-6 text-sm font-semibold">
                <a href="/" class="hover:text-crystal transition-colors {{ request()->is('/') ? 'text-crystal' : '' }}">DASHBOARD</a>
                <a href="/guilds" class="hover:text-crystal transition-colors {{ request()->is('guilds') ? 'text-crystal' : '' }}">GUILDS</a>
                <a href="/system" class="hover:text-crystal transition-colors {{ request()->is('system') ? 'text-crystal' : '' }}">SYSTEM LOG</a>
            </div>
            <div class="flex items-center gap-3">
                <span class="text-xs text-gray-500">MONARCH LEVEL 1</span>
                <button class="bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded border border-gray-700 text-xs">Wallet: 0x12..34</button>
            </div>
        </div>
    </nav>

    <!-- Main Content -->
    <main class="flex-grow container mx-auto p-6">
        @yield('content')
    </main>

    <!-- Footer -->
    <footer class="text-center text-xs text-gray-600 py-6">
        &copy; {{ date('Y') }} Shadow Monarch System. "Arise."
    </footer>

</body>
</html>
