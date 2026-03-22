'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCheckoutStore } from '@/stores/checkout';
import { cn } from '@/lib/utils';
import { useToast } from '@/providers';

const informationSchema = z.object({
  email: z.string().email('Please enter a valid email'),
  phone: z.string().min(10, 'Please enter a valid phone number'),
  firstName: z.string().min(2, 'First name is required'),
  lastName: z.string().min(2, 'Last name is required'),
  address1: z.string().min(5, 'Address is required'),
  address2: z.string().optional(),
  city: z.string().min(2, 'City is required'),
  province: z.string().min(2, 'Province/State is required'),
  postalCode: z.string().min(3, 'Postal code is required'),
  country: z.string().min(2, 'Country is required'),
  saveInfo: z.boolean().optional(),
});

type InformationFormData = z.infer<typeof informationSchema>;

export default function CheckoutInformationPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const { email, shippingAddress, setEmail, setShippingAddress, setCurrentStep } = useCheckoutStore();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InformationFormData>({
    resolver: zodResolver(informationSchema),
    defaultValues: {
      email: email || '',
      phone: shippingAddress?.phone || '',
      firstName: shippingAddress?.firstName || '',
      lastName: shippingAddress?.lastName || '',
      address1: shippingAddress?.address1 || '',
      address2: shippingAddress?.address2 || '',
      city: shippingAddress?.city || '',
      province: shippingAddress?.province || '',
      postalCode: shippingAddress?.postalCode || '',
      country: shippingAddress?.country || 'Zimbabwe',
      saveInfo: true,
    },
  });

  const onSubmit = async (data: InformationFormData) => {
    setEmail(data.email);
    setShippingAddress({
      firstName: data.firstName,
      lastName: data.lastName,
      address1: data.address1,
      address2: data.address2,
      city: data.city,
      province: data.province,
      postalCode: data.postalCode,
      country: data.country,
      phone: data.phone,
    });
    setCurrentStep(2);

    if (data.saveInfo) {
      await fetch('/api/account/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          firstName: data.firstName,
          lastName: data.lastName,
          address: {
            firstName: data.firstName,
            lastName: data.lastName,
            phone: data.phone,
            address1: data.address1,
            address2: data.address2,
            city: data.city,
            province: data.province,
            postalCode: data.postalCode,
            country: data.country,
          },
        }),
      }).catch(() => {
        showToast({
          title: 'Address not saved to profile',
          message: 'Checkout will continue with this address for this order.',
          variant: 'info',
        });
        return null;
      });
    }

    showToast({
      title: 'Information saved',
      message: 'Continue with shipping method.',
      variant: 'success',
      durationMs: 2200,
    });
    router.push('/checkout/shipping');
  };

  useEffect(() => {
    const hydrateFromAccount = async () => {
      try {
        const res = await fetch('/api/account/me', { cache: 'no-store' });
        const data = await res.json();
        const customer = data.customer;
        if (!customer) return;
        const address = customer.address || {};
        reset({
          email: String(customer.email || email || ''),
          phone: String(address.phone || shippingAddress?.phone || ''),
          firstName: String(address.firstName || shippingAddress?.firstName || ''),
          lastName: String(address.lastName || shippingAddress?.lastName || ''),
          address1: String(address.address1 || shippingAddress?.address1 || ''),
          address2: String(address.address2 || shippingAddress?.address2 || ''),
          city: String(address.city || shippingAddress?.city || ''),
          province: String(address.province || shippingAddress?.province || ''),
          postalCode: String(address.postalCode || shippingAddress?.postalCode || ''),
          country: String(address.country || shippingAddress?.country || 'Zimbabwe'),
          saveInfo: true,
        });
      } catch {
        // Silent fail: checkout still works with manual entry.
      }
    };
    hydrateFromAccount();
  }, [email, reset, shippingAddress]);

  const inputClassName = (error?: boolean) =>
    cn(
      "w-full px-4 py-3 border rounded-md text-sm",
      "focus:outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold",
      "transition-colors",
      error ? "border-red-500 bg-red-50" : "border-black/20"
    );

  return (
    <div>
      <h1 className="font-display text-xl tracking-widest uppercase mb-6">
        Contact Information
      </h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Contact */}
        <div className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              {...register('email')}
              className={inputClassName(!!errors.email)}
            />
            {errors.email && (
              <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium mb-1">
              Phone Number
            </label>
            <input
              id="phone"
              type="tel"
              placeholder="+263 7X XXX XXXX"
              {...register('phone')}
              className={inputClassName(!!errors.phone)}
            />
            {errors.phone && (
              <p className="text-red-500 text-xs mt-1">{errors.phone.message}</p>
            )}
          </div>
        </div>

        {/* Shipping Address */}
        <div>
          <h2 className="font-display text-lg tracking-wider uppercase mb-4 mt-8">
            Shipping Address
          </h2>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium mb-1">
                  First Name
                </label>
                <input
                  id="firstName"
                  type="text"
                  {...register('firstName')}
                  className={inputClassName(!!errors.firstName)}
                />
                {errors.firstName && (
                  <p className="text-red-500 text-xs mt-1">{errors.firstName.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm font-medium mb-1">
                  Last Name
                </label>
                <input
                  id="lastName"
                  type="text"
                  {...register('lastName')}
                  className={inputClassName(!!errors.lastName)}
                />
                {errors.lastName && (
                  <p className="text-red-500 text-xs mt-1">{errors.lastName.message}</p>
                )}
              </div>
            </div>

            <div>
              <label htmlFor="address1" className="block text-sm font-medium mb-1">
                Address
              </label>
              <input
                id="address1"
                type="text"
                placeholder="Street address"
                {...register('address1')}
                className={inputClassName(!!errors.address1)}
              />
              {errors.address1 && (
                <p className="text-red-500 text-xs mt-1">{errors.address1.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="address2" className="block text-sm font-medium mb-1">
                Apartment, suite, etc. (optional)
              </label>
              <input
                id="address2"
                type="text"
                {...register('address2')}
                className={inputClassName()}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="city" className="block text-sm font-medium mb-1">
                  City
                </label>
                <input
                  id="city"
                  type="text"
                  placeholder="e.g. Harare"
                  {...register('city')}
                  className={inputClassName(!!errors.city)}
                />
                {errors.city && (
                  <p className="text-red-500 text-xs mt-1">{errors.city.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="province" className="block text-sm font-medium mb-1">
                  Province
                </label>
                <input
                  id="province"
                  type="text"
                  placeholder="e.g. Harare Province"
                  {...register('province')}
                  className={inputClassName(!!errors.province)}
                />
                {errors.province && (
                  <p className="text-red-500 text-xs mt-1">{errors.province.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="postalCode" className="block text-sm font-medium mb-1">
                  Postal Code
                </label>
                <input
                  id="postalCode"
                  type="text"
                  {...register('postalCode')}
                  className={inputClassName(!!errors.postalCode)}
                />
                {errors.postalCode && (
                  <p className="text-red-500 text-xs mt-1">{errors.postalCode.message}</p>
                )}
              </div>
              <div>
                <label htmlFor="country" className="block text-sm font-medium mb-1">
                  Country
                </label>
                <select
                  id="country"
                  {...register('country')}
                  className={inputClassName(!!errors.country)}
                >
                  <option value="Zimbabwe">Zimbabwe</option>
                  <option value="South Africa">South Africa</option>
                  <option value="Botswana">Botswana</option>
                  <option value="Zambia">Zambia</option>
                  <option value="Mozambique">Mozambique</option>
                </select>
                {errors.country && (
                  <p className="text-red-500 text-xs mt-1">{errors.country.message}</p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Save Info */}
        <div className="flex items-center gap-3 pt-2">
          <input
            type="checkbox"
            id="saveInfo"
            {...register('saveInfo')}
            className="w-4 h-4 accent-gold"
          />
          <label htmlFor="saveInfo" className="text-sm text-black/70">
            Save this information for next time
          </label>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            "w-full bg-gold text-white py-4 text-sm font-semibold tracking-widest uppercase",
            "hover:bg-gold-dark transition-colors",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {isSubmitting ? 'Processing...' : 'Continue to Shipping'}
        </button>
      </form>
    </div>
  );
}
