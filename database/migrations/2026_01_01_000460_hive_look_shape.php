<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The frame a video or a linked post is shown in: tall (9:16, phone-shaped),
 * wide (16:9) or post (4:5).
 *
 * Another platform's post can't be measured from outside, so for links the
 * member chooses (we only guess a starting value). For an uploaded clip the
 * phone knows the real dimensions and sends the shape itself.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hive_looks', fn (Blueprint $table) => $table->string('shape', 8)->nullable()->after('embed_ref'));
    }

    public function down(): void
    {
        Schema::table('hive_looks', fn (Blueprint $table) => $table->dropColumn('shape'));
    }
};
