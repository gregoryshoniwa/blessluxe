<?php

namespace Tests\Unit;

use App\Support\Sizes;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

class SizesTest extends TestCase
{
    private function order(array $titles): array
    {
        return Sizes::sort(collect($titles)->map(fn ($t) => ['title' => $t]))->pluck('title')->all();
    }

    #[Test]
    public function letters_read_small_to_large(): void
    {
        $this->assertSame(['XS', 'S', 'M', 'L', 'XL'], $this->order(['S', 'L', 'M', 'XS', 'XL']));
        $this->assertSame(['S / Green', 'M / Green', '2XL'], $this->order(['2XL', 'M / Green', 'S / Green']));
    }

    #[Test]
    public function numbers_sort_as_numbers_and_unknowns_keep_their_place(): void
    {
        $this->assertSame(['8', '10', '12', '44-50'], $this->order(['12', '44-50', '8', '10']));
        $this->assertSame(['S', 'M', '10', 'Petite', 'Tall'], $this->order(['Petite', '10', 'M', 'Tall', 'S']));
    }
}
