<?php

namespace App\Services;

/**
 * ICE configuration for browser calls.
 *
 * This exists as a server endpoint rather than a Vite build variable for one
 * reason: TURN credentials are a billable resource. Anything compiled into the
 * JS bundle is public forever and cannot be rotated without a deploy, so a
 * leaked static credential means strangers relaying video on your account.
 * Issuing them per request lets them be short-lived and lets access be revoked
 * by logging someone out.
 */
class Rtc
{
    /**
     * @return array{ice_servers: array<int,array>, has_relay: bool, ring_seconds: int}
     */
    public static function iceServers(): array
    {
        $servers = [
            ['urls' => config('webrtc.stun')],
        ];

        $turn = config('webrtc.turn');
        $urls = $turn['urls'] ?? [];

        if ($urls) {
            if (! empty($turn['secret'])) {
                // coturn's `use-auth-secret` scheme: the username IS the expiry,
                // so the credential dies on its own even if it is captured.
                $expiry   = time() + max(60, (int) $turn['ttl']);
                $username = $expiry . ':blessluxe';
                $servers[] = [
                    'urls'       => $urls,
                    'username'   => $username,
                    'credential' => base64_encode(hash_hmac('sha1', $username, $turn['secret'], true)),
                ];
            } elseif (! empty($turn['username'])) {
                $servers[] = [
                    'urls'       => $urls,
                    'username'   => $turn['username'],
                    'credential' => (string) $turn['credential'],
                ];
            }
        }

        return [
            'ice_servers' => $servers,
            // The UI uses this to say "calls may not connect on some networks"
            // instead of silently failing on the ~15% that need a relay.
            'has_relay'    => count($servers) > 1,
            'ring_seconds' => (int) config('webrtc.ring_seconds'),
        ];
    }
}
