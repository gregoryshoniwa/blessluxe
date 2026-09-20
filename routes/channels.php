<?php

use App\Models\Affiliate;
use App\Models\Customer;
use App\Models\User;
use Illuminate\Support\Facades\Broadcast;

/*
|--------------------------------------------------------------------------
| Broadcast channels
|--------------------------------------------------------------------------
|
| Two audiences share this app: customers on the `customer` guard and staff on
| `web`. Every channel here resolves its user through the `realtime` guard
| (AppServiceProvider), which returns whichever of the two the requesting SPA
| is — so `$user` below is either a User (staff) or a Customer, and the
| callbacks branch on that rather than poking at guards themselves.
|
| The `guards` option is NOT optional. Without it Laravel resolves the user
| from the default guard (`web`) before the callback runs, and a customer-only
| session is refused outright. BroadcastChannelAuthTest pins this.
|
*/

$realtime = ['guards' => ['realtime']];

/**
 * One affiliate's conversation with BLESSLUXE.
 *
 * Two kinds of listener are allowed and nobody else:
 *   - the customer the affiliate record belongs to
 *   - any signed-in admin
 *
 * The returned array is the presence payload, so each side can show whether
 * the other is actually on the thread.
 */
Broadcast::channel('affiliate.{affiliateId}', function ($user, string $affiliateId) {
    $affiliate = Affiliate::find($affiliateId);
    if (! $affiliate) return false;

    // Staff can see every thread — that is the point of the admin inbox.
    if ($user instanceof User) {
        return ['name' => 'BLESSLUXE', 'role' => 'admin'];
    }

    // Otherwise only the affiliate themselves.
    if ($user instanceof Customer && $affiliate->customer_id === $user->id) {
        return ['name' => $affiliate->code, 'role' => 'affiliate'];
    }

    return false;
}, $realtime);

/**
 * Every thread's traffic, for the admin inbox list.
 *
 * Staff only, and strictly so: all affiliates' messages pass through this one
 * channel, so anyone else reaching it would read the whole company's mail.
 */
Broadcast::channel('admin.inbox', function ($user) {
    return $user instanceof User;
}, $realtime);
