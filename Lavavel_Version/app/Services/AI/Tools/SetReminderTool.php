<?php

namespace App\Services\AI\Tools;

use App\Services\AI\AgentContext;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SetReminderTool extends AiTool
{
    public function definition(): array
    {
        return [
            'name' => 'set_reminder',
            'description' => 'Subscribe the customer to price-drop / back-in-stock / sale alerts, or schedule a timed reminder.',
            'parameters' => [
                'type' => 'object',
                'properties' => [
                    'type'        => ['type' => 'string', 'enum' => ['price_drop', 'back_in_stock', 'sale_start', 'new_arrival', 'restock_reminder', 'event_reminder', 'wishlist_sale', 'cart_reminder']],
                    'product_id'  => ['type' => 'string'],
                    'category'    => ['type' => 'string'],
                    'target_price'=> ['type' => 'number'],
                    'channel'     => ['type' => 'string', 'enum' => ['push', 'email', 'sms']],
                    'message'     => ['type' => 'string'],
                    'scheduled_for' => ['type' => 'string', 'description' => 'ISO 8601 timestamp for timed reminders.'],
                ],
                'required' => ['type'],
            ],
        ];
    }

    public function execute(array $params, AgentContext $context): array
    {
        if (! $context->isAuthenticated()) return $this->fail('Sign in so I can save reminders to your account.');
        $type = (string) ($params['type'] ?? '');
        $channel = (string) ($params['channel'] ?? 'push');
        $customerId = $context->customer->id;

        // event_reminder + restock_reminder + plain timed → ai_reminders table.
        if (in_array($type, ['event_reminder', 'cart_reminder', 'restock_reminder', 'wishlist_sale'], true) && ! empty($params['scheduled_for'])) {
            DB::table('ai_reminders')->insert([
                'id'            => 'rem_' . Str::random(20),
                'customer_id'   => $customerId,
                'message'       => $params['message'] ?? "Don't forget — LUXE",
                'context'       => json_encode($params),
                'scheduled_for' => Carbon::parse($params['scheduled_for'])->toDateTimeString(),
                'channel'       => $channel,
                'status'        => 'pending',
                'created_at'    => now(),
                'updated_at'    => now(),
            ]);
            return $this->ok(['scheduled' => true]);
        }

        // Everything else is an event subscription.
        $targetId = (string) ($params['product_id'] ?? $params['category'] ?? '');
        $targetType = ! empty($params['product_id']) ? 'product' : 'category';
        if ($targetId === '') return $this->fail('Need a product or category to watch.');

        DB::table('ai_event_subscriptions')->updateOrInsert(
            [
                'customer_id' => $customerId,
                'event_type'  => $type,
                'target_id'   => $targetId,
                'target_type' => $targetType,
            ],
            [
                'id'         => 'evt_' . Str::random(20),
                'conditions' => json_encode($params),
                'channel'    => $channel,
                'active'     => true,
                'updated_at' => now(),
                'created_at' => now(),
            ],
        );
        return $this->ok(['subscribed' => true, 'type' => $type, 'target_id' => $targetId]);
    }
}
