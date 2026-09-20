<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Rtc;
use Illuminate\Support\Facades\Auth;

/**
 * Hands a signed-in caller the ICE servers for a browser call.
 *
 * A controller rather than a route closure so the route file stays cacheable —
 * `route:cache` refuses to serialise closures.
 *
 * The auth check lives here, not in route middleware, because the /api/account
 * group deliberately carries only `web` (so the SPA gets a JSON 401 rather than
 * a redirect to a login page it cannot render). That makes it easy to forget —
 * and forgetting it here means handing out TURN relay credentials, which are a
 * billable resource, to anyone who knows the URL.
 */
class RtcController extends Controller
{
    public function ice()
    {
        if (! Auth::guard('customer')->user() && ! Auth::guard('web')->user()) {
            return response()->json(['error' => 'Sign in first.'], 401);
        }

        return response()->json(Rtc::iceServers());
    }
}
