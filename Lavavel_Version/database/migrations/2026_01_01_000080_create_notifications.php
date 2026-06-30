<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->string('id')->primary();
            // Polymorphic — `recipient_type` is either Customer or User
            // (admin), `recipient_id` is the matching primary key. Indexed
            // together so the inbox query is a single seek.
            $table->string('recipient_type', 32);
            $table->string('recipient_id');
            $table->string('kind', 64);
            $table->string('title');
            $table->text('body')->nullable();
            $table->string('action_url')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['recipient_type', 'recipient_id', 'read_at']);
            $table->index(['recipient_type', 'recipient_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
