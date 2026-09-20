<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * A new message on an affiliate thread.
 *
 * Goes to two places in ONE publish:
 *
 *   presence-affiliate.{id}  the conversation itself. Presence rather than
 *                            private, because both sides want to know whether
 *                            the other is actually there — that is what makes
 *                            "online", "seen" and typing mean something.
 *
 *   private-admin.inbox      every thread's traffic, for the admin's list.
 *                            Without it the list could only stay current by
 *                            joining one channel per affiliate (thousands of
 *                            subscriptions) or by polling. With it, an admin
 *                            holds two subscriptions no matter how many
 *                            affiliates exist.
 *
 * ShouldBroadcastNow, NOT ShouldBroadcast. No queue worker runs in production,
 * so a queued broadcast would sit in the jobs table forever and the chat would
 * silently stop being realtime — the exact failure that is hardest to notice,
 * because `composer dev` DOES run `queue:listen`, so a queued broadcast looks
 * perfectly healthy on localhost and is dead the moment it deploys.
 *
 * The cost is a synchronous HTTP call to Reverb inside the send request. It is
 * capped by short timeouts in config/broadcasting.php and wrapped in a
 * try/catch at the call site (Messages::post), so a socket server that is down
 * costs a send at most a second and never loses a saved message.
 */
class AffiliateMessageSent implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public string $affiliateId,
        public array $message,
    ) {}

    /** @return array<int,\Illuminate\Broadcasting\Channel> */
    public function broadcastOn(): array
    {
        return [
            new PresenceChannel('affiliate.' . $this->affiliateId),
            new PrivateChannel('admin.inbox'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'message.sent';
    }

    public function broadcastWith(): array
    {
        return ['message' => $this->message];
    }
}
