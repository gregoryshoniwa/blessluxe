<?php

namespace Tests\Unit;

use App\Enums\PackageStatus;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * The package status list exists twice by necessity — once in PHP for validation
 * and API payloads, once in JS for the storefront and admin SPAs. It previously
 * existed FOUR times and had silently drifted.
 *
 * This test is the whole reason two copies are acceptable: edit one without the
 * other and the suite fails.
 */
class PackageStatusParityTest extends TestCase
{
    private const JS_PATH = __DIR__ . '/../../resources/js/lib/shipping.js';

    /** @return array<int,array{value:string,label:string,progressIndex:?int,isFailure:bool,icon:string}> */
    private function jsStatuses(): array
    {
        $src = file_get_contents(self::JS_PATH);
        $this->assertNotFalse($src, 'Could not read ' . self::JS_PATH);

        // Grab the PACKAGE_STATUSES array literal, then each row inside it.
        $this->assertSame(
            1,
            preg_match('/export const PACKAGE_STATUSES = \[(.*?)\n\];/s', $src, $block),
            'PACKAGE_STATUSES array not found in shipping.js — did its shape change?'
        );

        // Tolerant of whitespace and reformatting (prettier et al), so a style
        // change can never masquerade as a drift failure.
        preg_match_all(
            "/\{\s*value:\s*'([^']+)'\s*,\s*label:\s*'([^']+)'\s*,\s*progressIndex:\s*([0-9]+|null)\s*,\s*isFailure:\s*(true|false)\s*,\s*icon:\s*'([^']+)'\s*,?\s*\}/",
            $block[1],
            $rows,
            PREG_SET_ORDER
        );

        // A parse failure must report itself as a parse failure, not as drift.
        $this->assertSame(
            substr_count($block[1], '{ value:'),
            count($rows),
            'shipping.js parsed partially — the row shape changed, so this test can no longer verify parity.'
        );

        return array_map(fn ($m) => [
            'value'         => $m[1],
            'label'         => $m[2],
            'progressIndex' => $m[3] === 'null' ? null : (int) $m[3],
            'isFailure'     => $m[4] === 'true',
            'icon'          => $m[5],
        ], $rows);
    }

    #[Test]
    public function js_mirror_lists_the_same_statuses_in_the_same_order(): void
    {
        $this->assertSame(
            PackageStatus::values(),
            array_column($this->jsStatuses(), 'value'),
            'resources/js/lib/shipping.js has drifted from App\Enums\PackageStatus.'
        );
    }

    #[Test]
    public function js_mirror_matches_every_label_progress_failure_and_icon(): void
    {
        $js = [];
        foreach ($this->jsStatuses() as $row) {
            $js[$row['value']] = $row;
        }

        foreach (PackageStatus::cases() as $case) {
            $row = $js[$case->value] ?? null;
            $this->assertNotNull($row, "shipping.js is missing '{$case->value}'.");

            $this->assertSame($case->label(), $row['label'], "label mismatch for '{$case->value}'");
            $this->assertSame($case->progressIndex(), $row['progressIndex'], "progressIndex mismatch for '{$case->value}'");
            $this->assertSame($case->isFailure(), $row['isFailure'], "isFailure mismatch for '{$case->value}'");
            $this->assertSame($case->iconKey(), $row['icon'], "icon mismatch for '{$case->value}'");
        }
    }

    #[Test]
    public function failures_have_no_progress_position(): void
    {
        // The bug this enum was created to kill: a returned parcel must never
        // render as a complete progress bar.
        $this->assertNull(PackageStatus::Returned->progressIndex());
        $this->assertNull(PackageStatus::Cancelled->progressIndex());

        foreach (PackageStatus::cases() as $case) {
            if (! $case->isFailure()) {
                $this->assertNotNull($case->progressIndex(), "'{$case->value}' should have a progress position.");
            }
        }
    }
}
