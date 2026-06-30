<?php

namespace App\Services;

use App\Models\Customer;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * In-app notifications. Two audiences: `customer` (storefront bell) and
 * `admin` (admin shell bell). Kind is a short slug we can pivot on later
 * if we want kind-specific UI; for now everything renders the same way.
 *
 *   Notifications::forCustomer($customer, 'order_paid', '...', '...', '/account?tab=transactions');
 *   Notifications::forAllAdmins('affiliate_application', '...', '...', '/admin/affiliates');
 */
class Notifications
{
    public const TYPE_CUSTOMER = 'customer';
    public const TYPE_ADMIN    = 'admin';

    public static function forCustomer(
        Customer|string $customerOrId,
        string $kind,
        string $title,
        ?string $body = null,
        ?string $actionUrl = null,
        ?array $metadata = null,
    ): void {
        $id = $customerOrId instanceof Customer ? $customerOrId->id : $customerOrId;
        self::write(self::TYPE_CUSTOMER, $id, $kind, $title, $body, $actionUrl, $metadata);
    }

    public static function forAdmin(
        User|int|string $userOrId,
        string $kind,
        string $title,
        ?string $body = null,
        ?string $actionUrl = null,
        ?array $metadata = null,
    ): void {
        $id = $userOrId instanceof User ? $userOrId->id : $userOrId;
        self::write(self::TYPE_ADMIN, (string) $id, $kind, $title, $body, $actionUrl, $metadata);
    }

    /**
     * Fan-out to every active admin. Used for system-wide alerts (new
     * affiliate application, low stock, etc.) where every admin should see
     * the notification in their own bell.
     */
    public static function forAllAdmins(
        string $kind,
        string $title,
        ?string $body = null,
        ?string $actionUrl = null,
        ?array $metadata = null,
    ): void {
        User::query()->pluck('id')->each(function ($uid) use ($kind, $title, $body, $actionUrl, $metadata) {
            self::write(self::TYPE_ADMIN, (string) $uid, $kind, $title, $body, $actionUrl, $metadata);
        });
    }

    private static function write(
        string $type,
        string $recipientId,
        string $kind,
        string $title,
        ?string $body,
        ?string $actionUrl,
        ?array $metadata,
    ): void {
        DB::table('notifications')->insert([
            'id'             => 'ntf_' . Str::random(20),
            'recipient_type' => $type,
            'recipient_id'   => $recipientId,
            'kind'           => $kind,
            'title'          => $title,
            'body'           => $body,
            'action_url'     => $actionUrl,
            'metadata'       => $metadata ? json_encode($metadata) : null,
            'read_at'        => null,
            'created_at'     => now(),
        ]);
    }
}
