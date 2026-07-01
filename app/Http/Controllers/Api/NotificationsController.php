<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Notifications;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

/**
 * Customer-facing notifications inbox. Same shape is reused by the admin
 * inbox in App\Http\Controllers\Api\Admin\AdminNotificationsController.
 */
class NotificationsController extends Controller
{
    public function index(Request $request)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return ['notifications' => [], 'unread' => 0];

        $rows = DB::table('notifications')
            ->where('recipient_type', Notifications::TYPE_CUSTOMER)
            ->where('recipient_id', $customer->id)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get();

        $unread = DB::table('notifications')
            ->where('recipient_type', Notifications::TYPE_CUSTOMER)
            ->where('recipient_id', $customer->id)
            ->whereNull('read_at')
            ->count();

        return [
            'unread' => $unread,
            'notifications' => $rows->map(fn ($n) => [
                'id'         => $n->id,
                'kind'       => $n->kind,
                'title'      => $n->title,
                'body'       => $n->body,
                'action_url' => $n->action_url,
                'read_at'    => $n->read_at,
                'created_at' => $n->created_at,
            ]),
        ];
    }

    public function markRead(Request $request, string $id)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Unauthorised.'], 401);
        DB::table('notifications')
            ->where('id', $id)
            ->where('recipient_type', Notifications::TYPE_CUSTOMER)
            ->where('recipient_id', $customer->id)
            ->update(['read_at' => now()]);
        return ['ok' => true];
    }

    public function markAllRead(Request $request)
    {
        $customer = Auth::guard('customer')->user();
        if (! $customer) return response()->json(['error' => 'Unauthorised.'], 401);
        DB::table('notifications')
            ->where('recipient_type', Notifications::TYPE_CUSTOMER)
            ->where('recipient_id', $customer->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);
        return ['ok' => true];
    }
}
