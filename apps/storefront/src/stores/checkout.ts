import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Address {
  firstName: string;
  lastName: string;
  address1: string;
  address2?: string;
  city: string;
  province: string;
  postalCode: string;
  country: string;
  phone: string;
}

interface ShippingMethod {
  id: string;
  name: string;
  description: string;
  price: number;
  estimatedDays: string;
}

interface CheckoutState {
  // Contact
  email: string;
  setEmail: (email: string) => void;
  
  // Addresses
  shippingAddress: Address | null;
  billingAddress: Address | null;
  billingSameAsShipping: boolean;
  setShippingAddress: (address: Address) => void;
  setBillingAddress: (address: Address | null) => void;
  setBillingSameAsShipping: (same: boolean) => void;
  
  // Shipping
  shippingMethod: ShippingMethod | null;
  setShippingMethod: (method: ShippingMethod) => void;
  
  // Payment
  paymentMethod: string | null;
  setPaymentMethod: (method: string) => void;
  
  // Order
  orderId: string | null;
  orderNumber: string | null;
  setOrderComplete: (orderId: string, orderNumber: string) => void;
  
  // Step tracking
  currentStep: number;
  setCurrentStep: (step: number) => void;
  
  // Reset
  resetCheckout: () => void;
}

const initialState = {
  email: '',
  shippingAddress: null,
  billingAddress: null,
  billingSameAsShipping: true,
  shippingMethod: null,
  paymentMethod: null,
  orderId: null,
  orderNumber: null,
  currentStep: 1,
};

export const useCheckoutStore = create<CheckoutState>()(
  persist(
    (set) => ({
      ...initialState,

      setEmail: (email) => set({ email }),
      
      setShippingAddress: (address) => set({ shippingAddress: address }),
      
      setBillingAddress: (address) => set({ billingAddress: address }),
      
      setBillingSameAsShipping: (same) => set({ billingSameAsShipping: same }),
      
      setShippingMethod: (method) => set({ shippingMethod: method }),
      
      setPaymentMethod: (method) => set({ paymentMethod: method }),
      
      setOrderComplete: (orderId, orderNumber) => set({ orderId, orderNumber }),
      
      setCurrentStep: (step) => set({ currentStep: step }),
      
      resetCheckout: () => set(initialState),
    }),
    {
      name: 'blessluxe-checkout',
    }
  )
);
