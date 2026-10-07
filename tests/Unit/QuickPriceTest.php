<?php

namespace Tests\Unit;

use App\Services\QuickSeries;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

class QuickPriceTest extends TestCase
{
    #[Test]
    public function cost_plus_margin_rounds_up_to_the_dollar_without_floating_point_drift(): void
    {
        $this->assertSame(9900, QuickSeries::priceCents(90, 10));      // was $100: 90 × 1.1 = 99.00000000000001
        $this->assertSame(11300, QuickSeries::priceCents(90, 25));     // $112.50 → $113
        $this->assertSame(8400, QuickSeries::priceCents(60, 40));
        $this->assertSame(1100, QuickSeries::priceCents(7.86, 30));    // $10.218 → $11
        $this->assertSame(6000, QuickSeries::priceCents(60, 0));
    }

    #[Test]
    public function a_fixed_profit_adds_on_top_or_stands_alone(): void
    {
        $this->assertSame(10500, QuickSeries::priceCents(90, 0, 15));     // just add $15
        $this->assertSame(11000, QuickSeries::priceCents(90, 5, 15));     // $94.50 + $15 = $109.50 → $110
        $this->assertSame(10000, QuickSeries::priceCents(90, 0, 9.5));    // $99.50 → $100
        $this->assertSame(9900, QuickSeries::priceCents(90, 10, 0));
    }
}
