<?php

namespace Tests\Feature;

use App\Models\Customer;
use App\Models\CustomerAddress;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * An address has to be deliverable.
 *
 * Name and phone used to be nullable, so it was possible to save an address a
 * courier could do nothing with: no one to ask for, and no number to call — which
 * is how deliveries are actually coordinated locally.
 */
class CustomerAddressTest extends TestCase
{
    use RefreshDatabase;

    private function customer(): Customer
    {
        return Customer::create([
            'id' => 'cust_a1', 'email' => 'buyer@example.test',
            'first_name' => 'Rumbi', 'last_name' => 'Moyo',
            'password' => bcrypt('secret'),
        ]);
    }

    private function payload(array $override = []): array
    {
        return array_merge([
            'first_name' => 'Rumbi', 'last_name' => 'Moyo', 'phone' => '+263771234567',
            'line1' => '12 Fife Avenue', 'city' => 'Harare', 'country' => 'ZW',
        ], $override);
    }

    #[Test]
    public function a_deliverable_address_is_accepted(): void
    {
        $this->actingAs($this->customer(), 'customer')
            ->postJson('/api/account/addresses', $this->payload())
            ->assertOk();

        $this->assertDatabaseHas('customer_addresses', ['line1' => '12 Fife Avenue', 'country' => 'ZW']);
    }

    #[Test]
    public function a_recipient_name_is_required(): void
    {
        // Without it there is nobody for the courier to ask for.
        $this->actingAs($this->customer(), 'customer')
            ->postJson('/api/account/addresses', $this->payload(['first_name' => '']))
            ->assertStatus(422);
    }

    #[Test]
    public function a_phone_number_is_required(): void
    {
        // Drivers phone ahead rather than hunting for a street number.
        $this->actingAs($this->customer(), 'customer')
            ->postJson('/api/account/addresses', $this->payload(['phone' => '']))
            ->assertStatus(422);
    }

    #[Test]
    public function a_country_name_is_normalised_not_truncated(): void
    {
        // The old rule was size:2 plus a substr elsewhere, which turned
        // "Zimbabwe" into "ZI" — not a country.
        $this->actingAs($this->customer(), 'customer')
            ->postJson('/api/account/addresses', $this->payload(['country' => 'Zimbabwe']))
            ->assertOk();

        $this->assertSame('ZW', CustomerAddress::first()->country);
    }

    #[Test]
    public function an_unrecognised_country_is_refused(): void
    {
        // Better to reject than to store a confident guess.
        $this->actingAs($this->customer(), 'customer')
            ->postJson('/api/account/addresses', $this->payload(['country' => 'Atlantis']))
            ->assertStatus(422);

        $this->assertSame(0, CustomerAddress::count());
    }

    #[Test]
    public function an_address_saved_this_way_satisfies_the_affiliate_payout_check(): void
    {
        $customer = $this->customer();

        $this->actingAs($customer, 'customer')
            ->postJson('/api/account/addresses', $this->payload())
            ->assertOk();

        // The two rules must agree, or a customer can save an address and still be
        // told they have none.
        $this->actingAs($customer, 'customer')
            ->getJson('/api/store/affiliate/eligibility')
            ->assertOk()
            ->assertJson(['has_address' => true, 'eligible' => true]);
    }
}
