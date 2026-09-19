<?php

namespace Tests\Feature;

use App\Models\Affiliate;
use App\Models\Customer;
use App\Models\CustomerAddress;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Affiliates pick their own code, checked live while they type.
 *
 * The live check is a courtesy, not a guarantee — these tests pin down that the
 * server re-checks on submit, because between the tick turning green and the
 * button being pressed, somebody else can take it.
 */
class AffiliateCodeChoiceTest extends TestCase
{
    use RefreshDatabase;

    private function customer(string $id = 'cust_1', string $email = 'a@example.test'): Customer
    {
        $c = Customer::create([
            'id' => $id, 'email' => $email, 'first_name' => 'Rumbi', 'last_name' => 'Moyo',
            'password' => bcrypt('secret'),
        ]);
        CustomerAddress::create([
            'id' => 'addr_' . $id, 'customer_id' => $id,
            'first_name' => 'Rumbi', 'last_name' => 'Moyo',
            'line1' => '12 Fife Avenue', 'city' => 'Harare', 'country' => 'ZW',
        ]);
        return $c;
    }

    #[Test]
    public function a_free_code_reports_available(): void
    {
        $this->actingAs($this->customer(), 'customer')
            ->getJson('/api/store/affiliate/code-available?code=RUMBISTYLE')
            ->assertOk()
            ->assertJson(['code' => 'RUMBISTYLE', 'available' => true, 'reason' => null]);
    }

    #[Test]
    public function a_taken_code_reports_unavailable_with_suggestions(): void
    {
        Affiliate::create([
            'id' => 'aff_x', 'code' => 'RUMBI', 'email' => 'x@example.test',
            'first_name' => 'X', 'commission_rate' => 10, 'status' => 'active',
        ]);

        $res = $this->actingAs($this->customer(), 'customer')
            ->getJson('/api/store/affiliate/code-available?code=rumbi')
            ->assertOk()
            ->assertJson(['available' => false, 'reason' => 'Already taken.']);

        // Suggestions keep the spirit of what they typed rather than a random string.
        $suggestions = $res->json('suggestions');
        $this->assertNotEmpty($suggestions);
        foreach ($suggestions as $s) {
            $this->assertStringStartsWith('RUMBI', $s);
            $this->assertNull(Affiliate::codeUnavailableReason($s));
        }
    }

    #[Test]
    public function a_pending_applicants_code_is_already_held(): void
    {
        Mail::fake();
        $first = $this->customer('cust_1', 'one@example.test');
        $this->actingAs($first, 'customer')
            ->postJson('/api/store/affiliate/apply', ['code' => 'GLOW'])
            ->assertOk();

        // Reserving on application is what makes the live tick honest — an
        // unapproved application still holds the code.
        $this->actingAs($this->customer('cust_2', 'two@example.test'), 'customer')
            ->getJson('/api/store/affiliate/code-available?code=GLOW')
            ->assertJson(['available' => false, 'reason' => 'Already taken.']);
    }

    #[Test]
    public function case_does_not_create_two_affiliates(): void
    {
        Mail::fake();
        $this->actingAs($this->customer('cust_1', 'one@example.test'), 'customer')
            ->postJson('/api/store/affiliate/apply', ['code' => 'Glow'])
            ->assertOk();

        // Codes land in public URLs and get read aloud; JANE10 and jane10 must
        // never be two people splitting one person's commission.
        $this->assertSame('GLOW', Affiliate::first()->code);

        $this->actingAs($this->customer('cust_2', 'two@example.test'), 'customer')
            ->postJson('/api/store/affiliate/apply', ['code' => 'glow'])
            ->assertStatus(422)
            ->assertJson(['reason' => 'code_unavailable']);
    }

    #[Test]
    public function the_server_re_checks_even_if_the_live_check_said_yes(): void
    {
        Mail::fake();
        $second = $this->customer('cust_2', 'two@example.test');

        // Their browser saw a green tick...
        $this->actingAs($second, 'customer')
            ->getJson('/api/store/affiliate/code-available?code=SPARK')
            ->assertJson(['available' => true]);

        // ...then somebody else took it in the meantime.
        Affiliate::create([
            'id' => 'aff_fast', 'code' => 'SPARK', 'email' => 'fast@example.test',
            'first_name' => 'Fast', 'commission_rate' => 10, 'status' => 'active',
        ]);

        $this->actingAs($second, 'customer')
            ->postJson('/api/store/affiliate/apply', ['code' => 'SPARK'])
            ->assertStatus(422)
            ->assertJson(['reason' => 'code_unavailable']);

        $this->assertSame(1, Affiliate::where('code', 'SPARK')->count());
    }

    #[Test]
    public function reserved_words_are_refused(): void
    {
        $customer = $this->customer();

        // These would read as official BLESSLUXE pages in a share URL.
        foreach (['ADMIN', 'blessluxe', 'Shop', 'CHECKOUT'] as $bad) {
            $this->actingAs($customer, 'customer')
                ->getJson('/api/store/affiliate/code-available?code=' . $bad)
                ->assertJson(['available' => false, 'reason' => 'That one is reserved.']);
        }
    }

    #[Test]
    public function malformed_codes_are_refused_with_a_readable_reason(): void
    {
        $customer = $this->customer();

        $cases = [
            'AB'                      => 'Too short',
            'THISCODEISWAYTOOLONGFORUS' => 'Too long',
            'JANE!'                   => 'Letters, numbers',
            '-JANE'                   => 'Letters, numbers',
            'JANE-'                   => 'Letters, numbers',
        ];

        foreach ($cases as $code => $expected) {
            $res = $this->actingAs($customer, 'customer')
                ->getJson('/api/store/affiliate/code-available?code=' . urlencode($code))
                ->assertOk()
                ->assertJson(['available' => false]);

            $this->assertStringContainsString($expected, $res->json('reason'), "for '{$code}'");
        }
    }

    #[Test]
    public function a_guest_cannot_enumerate_codes(): void
    {
        Affiliate::create([
            'id' => 'aff_x', 'code' => 'SECRET1', 'email' => 'x@example.test',
            'first_name' => 'X', 'commission_rate' => 10, 'status' => 'active',
        ]);

        // A public endpoint would let anyone walk the whole affiliate list.
        $this->getJson('/api/store/affiliate/code-available?code=SECRET1')
            ->assertStatus(401);
    }

    #[Test]
    public function applying_without_a_code_is_refused(): void
    {
        Mail::fake();

        $this->actingAs($this->customer(), 'customer')
            ->postJson('/api/store/affiliate/apply', [])
            ->assertStatus(422);

        $this->assertSame(0, Affiliate::count());
    }
}
