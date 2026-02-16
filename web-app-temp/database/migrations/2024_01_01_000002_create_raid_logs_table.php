<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('raid_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('guild_id')->constrained('guilds');
            $table->string('portal_color'); // Red, Blue, Green
            $table->decimal('profit', 20, 8);
            $table->string('token_in');
            $table->string('token_out');
            $table->string('tx_hash')->nullable();
            $table->timestamp('executed_at');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('raid_logs');
    }
};
