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
 * Affiliates are customers first.
 *
 * Previously anyone could apply with any email, and the link between an affiliate
 * and a customer was a matching email STRING — so changing your email silently
 * broke it, and nothing stopped applying on behalf of an address you don't own.
 */
class AffiliateApplyTest extends TestCase
{
    use RefreshDatabase;

    private function customer(array $attrs = []): Customer
    {
        return Customer::create(array_merge([
            'id'         => 'cust_test1',
            'email'      => 'buyer@example.test',
            'first_name' => 'Rumbi',
            'last_name'  => 'Moyo',
            'password'   => bcrypt('secret'),
        ], $attrs));
    }

    private function addressFor(Customer $c): CustomerAddress
    {
        return CustomerAddress::create([
            'id' => 'addr_t1', 'customer_id' => $c->id,
            'first_name' => 'Rumbi', 'last_name' => 'Moyo',
            'line1' => '12 Fife Avenue', 'city' => 'Harare', 'country' => 'ZW',
            'is_default_shipping' => true,
        ]);
    }

    #[Test]
    public function a_guest_cannot_apply(): void
    {
        Mail::fake();

        $this->postJson('/api/store/affiliate/apply', ['code' => 'RUMBI'])
            ->assertStatus(401)
            ->assertJson(['reason' => 'sign_in_required']);

        $this->assertSame(0, Affiliate::count());
    }

    #[Test]
    public function eligibility_tells_a_guest_to_sign_in(): void
    {
        $this->getJson('/api/store/affiliate/eligibility')
            ->assertOk()
            ->assertJson(['signed_in' => false, 'eligible' => false, 'reason' => 'sign_in_required']);
    }

    #[Test]
    public function applying_without_an_address_is_refused(): void
    {
        Mail::fake();
        $customer = $this->customer();

        // Commission has to be paid somewhere; chasing it after approval is worse.
        $this->actingAs($customer, 'customer')
            ->postJson('/api/store/affiliate/apply', ['code' => 'RUMBI'])
            ->assertStatus(422)
            ->assertJson(['reason' => 'address_required']);

        $this->assertSame(0, Affiliate::count());
    }

    #[Test]
    public function a_signed_in_customer_with_an_address_can_apply(): void
    {
        Mail::fake();
        $customer = $this->customer();
        $this->addressFor($customer);

        $this->actingAs($customer, 'customer')
            ->postJson('/api/store/affiliate/apply', ['code' => 'RUMBI'])
            ->assertOk()
            // Reserved the moment they apply, so the live check is honest.
            ->assertJsonPath('affiliate.code', 'RUMBI');

        $aff = Affiliate::first();
        // Tied to the account, not to a typed-in string.
        $this->assertSame($customer->id, $aff->customer_id);
        $this->assertSame('buyer@example.test', $aff->email);
        $this->assertSame('Rumbi', $aff->first_name);
        // Snapshotted so a later address edit cannot redirect a payout.
        $this->assertSame('12 Fife Avenue', $aff->payout_address['line1']);
    }

    #[Test]
    public function identity_comes_from_the_account_not_the_request_body(): void
    {
        Mail::fake();
        $customer = $this->customer();
        $this->addressFor($customer);

        // Attempt to apply as somebody else entirely.
        $this->actingAs($customer, 'customer')
            ->postJson('/api/store/affiliate/apply', [
                'code' => 'RUMBI',
                'email' => 'attacker@evil.test',
                'first_name' => 'Someone',
                'last_name' => 'Else',
            ])
            ->assertOk();

        $aff = Affiliate::first();
        $this->assertSame('buyer@example.test', $aff->email, 'The posted email must be ignored.');
        $this->assertSame('Rumbi', $aff->first_name, 'The posted name must be ignored.');
    }

    #[Test]
    public function a_customer_cannot_apply_twice(): void
    {
        Mail::fake();
        $customer = $this->customer();
        $this->addressFor($customer);

        $this->actingAs($customer, 'customer')->postJson('/api/store/affiliate/apply', ['code' => 'RUMBI'])->assertOk();

        $this->actingAs($customer, 'customer')
            ->postJson('/api/store/affiliate/apply', ['code' => 'RUMBI'])
            ->assertStatus(409);

        $this->assertSame(1, Affiliate::count());
    }

    #[Test]
    public function an_older_email_only_affiliate_still_blocks_a_duplicate(): void
    {
        Mail::fake();
        $customer = $this->customer();
        $this->addressFor($customer);

        // Row from before affiliates were linked to accounts.
        Affiliate::create([
            'id' => 'aff_legacy', 'code' => 'LEGACY', 'email' => 'buyer@example.test',
            'first_name' => 'Rumbi', 'commission_rate' => 10, 'status' => 'approved',
        ]);

        $this->actingAs($customer, 'customer')
            ->postJson('/api/store/affiliate/apply', ['code' => 'RUMBI'])
            ->assertStatus(409);

        $this->assertSame(1, Affiliate::count());
    }

    #[Test]
    public function an_incomplete_address_is_reported_differently_from_none(): void
    {
        Mail::fake();
        $customer = $this->customer();

        // Addresses saved from checkout have no name or phone, so this is the
        // common case. "Add an address" would be maddening to read while looking
        // at one you already saved.
        CustomerAddress::create([
            'id' => 'addr_bad', 'customer_id' => $customer->id,
            'line1' => 'asdasdas', 'city' => 'sdsf', 'country' => 'ZW',
        ]);

        $this->actingAs($customer, 'customer')
            ->getJson('/api/store/affiliate/eligibility')
            ->assertOk()
            ->assertJson(['has_address' => false, 'has_any_address' => true, 'reason' => 'address_incomplete']);

        $this->actingAs($customer, 'customer')
            ->postJson('/api/store/affiliate/apply', ['code' => 'RUMBI'])
            ->assertStatus(422)
            ->assertJson(['reason' => 'address_incomplete']);
    }

    private function admin(): \App\Models\User
    {
        return \App\Models\User::create([
            'name' => 'Admin', 'email' => 'admin@test.test', 'password' => bcrypt('x'),
        ]);
    }

    #[Test]
    public function the_chosen_code_survives_approval_unchanged(): void
    {
        Mail::fake();
        $customer = $this->customer();
        $this->addressFor($customer);
        $admin = $this->admin();

        $this->actingAs($customer, 'customer')
            ->postJson('/api/store/affiliate/apply', ['code' => 'RUMBI'])
            ->assertOk();

        $aff = Affiliate::first();
        // Their chosen code is held from the moment they apply.
        $this->assertSame('RUMBI', $aff->code);

        $this->actingAs($admin, 'web')
            ->putJson("/api/admin/affiliates/{$aff->id}", ['status' => 'active'])
            ->assertOk();

        // Unchanged by approval — it was theirs from the start.
        $this->assertSame('RUMBI', $aff->fresh()->code);
    }

    #[Test]
    public function approval_assigns_the_code_emails_and_notifies_in_one_action(): void
    {
        Mail::fake();
        $customer = $this->customer();
        $this->addressFor($customer);
        $admin = $this->admin();

        $this->actingAs($customer, 'customer')->postJson('/api/store/affiliate/apply', ['code' => 'RUMBI'])->assertOk();
        $aff = Affiliate::first();

        $notesBefore = \Illuminate\Support\Facades\DB::table('notifications')
            ->where('recipient_type', 'customer')->count();

        $this->actingAs($admin, 'web')
            ->putJson("/api/admin/affiliates/{$aff->id}", ['status' => 'active'])
            ->assertOk()
            // The response carries the new code so admin can be told what it is.
            ->assertJsonPath('affiliate.code', 'RUMBI');

        $this->assertSame('active', $aff->fresh()->status);
        Mail::assertSent(\App\Mail\AffiliateApprovedMail::class);

        $this->assertGreaterThan(
            $notesBefore,
            \Illuminate\Support\Facades\DB::table('notifications')->where('recipient_type', 'customer')->count(),
            'Approval should notify the customer in-app as well as by email.'
        );
    }

    #[Test]
    public function the_application_email_never_promises_a_code(): void
    {
        $aff = Affiliate::create([
            'id' => 'aff_mail', 'code' => null, 'email' => 'x@example.test',
            'first_name' => 'Rumbi', 'commission_rate' => 10, 'status' => 'pending',
        ]);

        $html = (new \App\Mail\AffiliateApplicationReceivedMail($aff))->render();

        // The old copy rendered "your reserved code is ." with nothing in it,
        // because no code exists until approval.
        $this->assertStringNotContainsString('reserved code', $html);
        $this->assertStringNotContainsString('code is .', $html);
        $this->assertStringContainsString('Once approved', $html);
    }

    #[Test]
    public function a_code_another_affiliate_holds_cannot_be_claimed(): void
    {
        Mail::fake();
        $customer = $this->customer();
        $this->addressFor($customer);

        // Another Rumbi got there first.
        Affiliate::create([
            'id' => 'aff_taken', 'code' => 'RUMBI', 'email' => 'other@example.test',
            'first_name' => 'Rumbi', 'commission_rate' => 10, 'status' => 'active',
        ]);

        // A collision would route one affiliate's commission to the other, so
        // the second applicant is turned away rather than quietly renamed.
        $this->actingAs($customer, 'customer')
            ->postJson('/api/store/affiliate/apply', ['code' => 'RUMBI'])
            ->assertStatus(422)
            ->assertJson(['reason' => 'code_unavailable']);

        $this->assertSame(1, Affiliate::where('code', 'RUMBI')->count());

        // Picking something free works.
        $this->actingAs($customer, 'customer')
            ->postJson('/api/store/affiliate/apply', ['code' => 'RUMBI-ZW'])
            ->assertOk()
            ->assertJsonPath('affiliate.code', 'RUMBI-ZW');
    }

    #[Test]
    public function an_admin_can_override_the_assigned_code(): void
    {
        Mail::fake();
        $customer = $this->customer();
        $this->addressFor($customer);
        $admin = $this->admin();

        $this->actingAs($customer, 'customer')
            ->postJson('/api/store/affiliate/apply', ['code' => 'RUMBI'])
            ->assertOk();

        $aff = Affiliate::first();
        $this->actingAs($admin, 'web')->putJson("/api/admin/affiliates/{$aff->id}", ['status' => 'active']);

        // The escape hatch that replaced the applicant's wish list.
        $this->actingAs($admin, 'web')
            ->putJson("/api/admin/affiliates/{$aff->id}", ['code' => 'rumbi10'])
            ->assertOk();

        // Codes land in public URLs, so case is normalised — JANE10 and jane10
        // must not become two affiliates.
        $this->assertSame('RUMBI10', $aff->fresh()->code);
    }

    #[Test]
    public function an_admin_cannot_assign_a_code_another_affiliate_holds(): void
    {
        Mail::fake();
        $customer = $this->customer();
        $this->addressFor($customer);
        $admin = $this->admin();

        Affiliate::create([
            'id' => 'aff_other', 'code' => 'TAKEN', 'email' => 'other@example.test',
            'first_name' => 'Other', 'commission_rate' => 10, 'status' => 'active',
        ]);

        $this->actingAs($customer, 'customer')
            ->postJson('/api/store/affiliate/apply', ['code' => 'RUMBI'])
            ->assertOk();

        $aff = Affiliate::where('customer_id', $customer->id)->first();

        $this->actingAs($admin, 'web')
            ->putJson("/api/admin/affiliates/{$aff->id}", ['code' => 'TAKEN'])
            ->assertStatus(422);
    }


    #[Test]
    public function applying_asks_for_nothing_and_links_go_on_the_profile_later(): void
    {
        Mail::fake();
        $customer = $this->customer();
        $this->addressFor($customer);
        $admin = $this->admin();

        // An empty body is a complete application — everything needed is already
        // on the account.
        $this->actingAs($customer, 'customer')
            ->postJson('/api/store/affiliate/apply', ['code' => 'RUMBI'])
            ->assertOk();

        $aff = Affiliate::first();
        $this->assertSame([], $aff->metadata ?? []);

        $this->actingAs($admin, 'web')->putJson("/api/admin/affiliates/{$aff->id}", ['status' => 'active']);

        // The affiliate fills in their own links afterwards, if they want to.
        $this->actingAs($customer, 'customer')
            ->putJson('/api/account/affiliate/profile', [
                'instagram' => '@rumbi', 'bio' => 'Harare style',
            ])
            ->assertOk()
            ->assertJsonPath('profile.instagram', '@rumbi');

        // A partial save must not wipe what was already there.
        $this->actingAs($customer, 'customer')
            ->putJson('/api/account/affiliate/profile', ['tiktok' => '@rumbi.tt'])
            ->assertOk()
            ->assertJsonPath('profile.instagram', '@rumbi')
            ->assertJsonPath('profile.tiktok', '@rumbi.tt');
    }

    #[Test]
    public function a_non_affiliate_cannot_edit_an_affiliate_profile(): void
    {
        $customer = $this->customer();

        $this->actingAs($customer, 'customer')
            ->putJson('/api/account/affiliate/profile', ['instagram' => '@nope'])
            ->assertStatus(404);
    }

    #[Test]
    public function eligibility_reports_what_is_missing(): void
    {
        $customer = $this->customer();

        $this->actingAs($customer, 'customer')
            ->getJson('/api/store/affiliate/eligibility')
            ->assertOk()
            ->assertJson([
                'signed_in'   => true,
                'has_address' => false,
                'eligible'    => false,
                'reason'      => 'address_required',
            ])
            // The form should render what we already know rather than ask again.
            ->assertJsonPath('customer.email', 'buyer@example.test');

        $this->addressFor($customer);

        $this->actingAs($customer, 'customer')
            ->getJson('/api/store/affiliate/eligibility')
            ->assertOk()
            ->assertJson(['has_address' => true, 'eligible' => true]);
    }
}
