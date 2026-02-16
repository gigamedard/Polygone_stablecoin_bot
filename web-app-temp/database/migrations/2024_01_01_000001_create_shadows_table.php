<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shadows', function (Blueprint $table) {
            $table->id();
            $table->string('user_wallet_address'); // "User" derived from wallet
            $table->foreignId('guild_id')->constrained('guilds');
            $table->string('name')->default('Shadow'); // User named shadow
            $table->string('rank')->default('E'); // E, D, C, B, A, S
            $table->decimal('amount', 20, 8); // Amount deposited
            $table->decimal('shares', 20, 8); // Shares in the pool
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shadows');
    }
};
