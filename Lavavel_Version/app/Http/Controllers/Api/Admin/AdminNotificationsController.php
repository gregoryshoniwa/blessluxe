<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Services\Notifications;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class AdminNotificationsController extends Controller
{
    public function index(Request $request)
    {
        $user = Auth::guard('web')->user();
        if (! $user) return ['notifications' => [], 'unread' => 0];

        $rows = DB::table('notifications')
            ->where('recipient_type', Notifications::TYPE_ADMIN)
            ->where('recipient_id', (string) $user->id)
            ->orderByDesc('created_at')
            ->limit(50)
            ->get();

        $unread = DB::table('notifications')
            ->where('recipient_type', Notifications::TYPE_ADMIN)
            ->where('recipient_id', (string) $user->id)
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
        $user = Auth::guard('web')->user();
        if (! $user) return response()->json(['error' => 'Unauthorised.'], 401);
        DB::table('notifications')
            ->where('id', $id)
            ->where('recipient_type', Notifications::TYPE_ADMIN)
            ->where('recipient_id', (string) $user->id)
            ->update(['read_at' => now()]);
        return ['ok' => true];
    }

    public function markAllRead(Request $request)
    {
        $user = Auth::guard('web')->user();
        if (! $user) return response()->json(['error' => 'Unauthorised.'], 401);
        DB::table('notifications')
            ->where('recipient_type', Notifications::TYPE_ADMIN)
            ->where('recipient_id', (string) $user->id)
            ->whereNull('read_at')
            ->update(['read_at' => now()]);
        return ['ok' => true];
    }
}
