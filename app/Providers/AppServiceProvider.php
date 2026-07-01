<?php

namespace App\Providers;

use App\Services\AI\ContextBuilder;
use App\Services\AI\GeminiService;
use App\Services\AI\MemoryManager;
use App\Services\AI\PreferenceLearner;
use App\Services\AI\ShoppingAgent;
use App\Services\AI\Tools\ToolRegistry;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(GeminiService::class);
        $this->app->singleton(ToolRegistry::class);
        $this->app->singleton(ContextBuilder::class);
        $this->app->singleton(MemoryManager::class);
        $this->app->singleton(PreferenceLearner::class);
        $this->app->singleton(ShoppingAgent::class);
    }

    public function boot(): void
    {
        //
    }
}
