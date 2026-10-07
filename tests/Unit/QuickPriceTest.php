<?php

namespace Tests\Unit;

use App\Services\QuickSeries;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

class QuickPriceTest extends TestCase
{
    #[Test]
    public function cost_plus_margin_is_exact_to_the_cent_without_floating_point_drift(): void
    {
        $this->assertSame(9900, QuickSeries::priceCents(90, 10));      // 90 × 1.1 is 99.00000000000001 in floating point
        $this->assertSame(9450, QuickSeries::priceCents(90, 5));       // $94.50, not rounded up to $95
        $this->assertSame(11250, QuickSeries::priceCents(90, 25));
        $this->assertSame(8400, QuickSeries::priceCents(60, 40));
        $this->assertSame(1022, QuickSeries::priceCents(7.86, 30));    // $10.218 → $10.22
        $this->assertSame(6000, QuickSeries::priceCents(60, 0));
    }

    #[Test]
    public function a_fixed_profit_adds_on_top_or_stands_alone(): void
    {
        $this->assertSame(10500, QuickSeries::priceCents(90, 0, 15));     // just add $15
        $this->assertSame(10950, QuickSeries::priceCents(90, 5, 15));     // $94.50 + $15
        $this->assertSame(9950, QuickSeries::priceCents(90, 0, 9.5));
    }
}
