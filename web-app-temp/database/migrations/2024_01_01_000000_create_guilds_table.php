<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('guilds', function (Blueprint $table) {
            $table->id();
            $table->string('contract_address')->unique();
            $table->string('name');
            $table->string('asset_symbol')->default('USDC');
            $table->decimal('total_liquidity', 20, 8)->default(0);
            $table->decimal('max_capacity', 20, 8)->default(1000);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('guilds');
    }
};
