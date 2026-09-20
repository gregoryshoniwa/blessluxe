<?php

namespace App\Providers;

use App\Services\AI\ContextBuilder;
use App\Services\AI\GeminiService;
use App\Services\AI\MemoryManager;
use App\Services\AI\PreferenceLearner;
use App\Services\AI\ShoppingAgent;
use App\Services\AI\Tools\ToolRegistry;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
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
        /**
         * Bless Hive rate limits — one bucket PER KIND OF ACTION, per member.
         *
         * Plain `throttle:10,1` keeps a single counter per visitor across every
         * throttled route (the key is just domain + IP, because customers aren't
         * on the default guard). Ten hearts would then use up the allowance for
         * posting a look. Named limiters with the action in the key fix that.
         */
        foreach (['hive-post' => 12, 'hive-talk' => 40, 'hive-tap' => 180, 'hive-read' => 180] as $name => $perMinute) {
            \Illuminate\Support\Facades\RateLimiter::for($name, fn (\Illuminate\Http\Request $request) => \Illuminate\Cache\RateLimiting\Limit::perMinute($perMinute)
                ->by($name . '|' . (Auth::guard('customer')->id() ?: $request->ip())));
        }

        /**
         * Identity for broadcast channel auth.
         *
         * Laravel resolves a channel's user from a guard list BEFORE the channel
         * callback runs, and by default that list is just the default guard —
         * `web`. A customer who is not also staff was therefore rejected before
         * routes/channels.php was ever consulted, and their chat fell back to
         * polling forever with nothing in any log.
         *
         * Two session guards also means one browser can hold both. The SPA says
         * which half it is (`as`), so a storefront tab joins as the customer and
         * an admin tab as staff, instead of both collapsing into one presence
         * member. `as` only ever SELECTS between sessions that really exist —
         * it cannot grant one.
         */
        Auth::viaRequest('realtime', function (Request $request) {
            $admin    = Auth::guard('web')->user();
            $customer = Auth::guard('customer')->user();

            return match ($request->input('as')) {
                'affiliate' => $customer,
                'admin'     => $admin,
                default     => $admin ?: $customer,
            };
        });
    }
}
