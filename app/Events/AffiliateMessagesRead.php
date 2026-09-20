<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PresenceChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * One side opened the thread and read the other side's messages.
 *
 * Without this the ticks are a lie. `markRead` updates the database, but the
 * person who SENT the message is never told, so their bubbles sit on a single
 * tick until their next full refetch — and once the socket connects that poll
 * slows to 30s, while the admin side has no poll at all. The read state was
 * correct in the database and permanently stale on screen.
 *
 * Carries the reader rather than a list of ids: "everything from the other side
 * up to now is read" is the only state a thread of two participants can be in,
 * and it stays correct even if a message was still in flight.
 *
 * @see AffiliateMessageSent for why this is ShouldBroadcastNow and not queued.
 */
class AffiliateMessagesRead implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public string $affiliateId,
        public string $reader,   // 'affiliate' | 'admin'
        public string $at,
    ) {}

    public function broadcastOn(): PresenceChannel
    {
        return new PresenceChannel('affiliate.' . $this->affiliateId);
    }

    public function broadcastAs(): string
    {
        return 'messages.read';
    }

    public function broadcastWith(): array
    {
        return ['reader' => $this->reader, 'at' => $this->at];
    }
}
