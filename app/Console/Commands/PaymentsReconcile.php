<?php

namespace App\Console\Commands;

use App\Models\PaymentSession;
use App\Services\Payments\Payments;
use Illuminate\Console\Command;

/**
 * Ask every gateway about payments still marked pending.
 *
 * Paynow tells us when a payment lands (IPN). VelocityAfrica doesn't — so a
 * customer who paid by USSD and then closed the tab leaves a paid payment we
 * haven't heard about, with no order made. This finds those. No scheduler
 * runs in production, so it is also a button on /admin/payments; schedule it
 * once one exists.
 */
class PaymentsReconcile extends Command
{
    protected $signature = 'payments:reconcile {--hours=48}';
    protected $description = 'Refresh pending payment sessions against their gateways and apply the outcome';

    public function handle(): int
    {
        $rows = PaymentSession::where('status', 'pending')
            ->where('created_at', '>=', now()->subHours((int) $this->option('hours')))
            ->where('created_at', '<=', now()->subSeconds(30))
            ->orderBy('created_at')->limit(500)->get();

        $changed = [];
        foreach ($rows as $s) {
            $after = Payments::refresh($s, force: true);
            if ($after->status !== 'pending') $changed[] = "{$after->reference} → {$after->status}";
        }

        $this->info(sprintf('Checked %d pending payment(s); %d settled.', $rows->count(), count($changed)));
        foreach ($changed as $line) $this->line('  ' . $line);

        return self::SUCCESS;
    }
}
