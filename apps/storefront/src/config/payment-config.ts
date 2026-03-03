/**
 * Payment Methods Configuration
 * 
 * Add or remove payment methods here. Each method should have:
 * - id: unique identifier
 * - name: display name
 * - icon: icon name from lucide-react
 * - description: short description
 * - enabled: whether this method is active
 * - type: 'card' | 'mobile' | 'bank'
 */

export interface PaymentMethod {
  id: string;
  name: string;
  icon: 'CreditCard' | 'Smartphone' | 'Banknote' | 'Wallet';
  description: string;
  enabled: boolean;
  type: 'card' | 'mobile' | 'bank';
  // For mobile money - phone format
  phoneFormat?: string;
  // For card - supported networks
  supportedNetworks?: string[];
}

export const paymentMethods: PaymentMethod[] = [
  {
    id: 'card',
    name: 'Card Payment',
    icon: 'CreditCard',
    description: 'Pay with Visa or Mastercard',
    enabled: true,
    type: 'card',
    supportedNetworks: ['visa', 'mastercard'],
  },
  {
    id: 'ecocash',
    name: 'EcoCash',
    icon: 'Smartphone',
    description: 'Pay from your EcoCash wallet',
    enabled: true,
    type: 'mobile',
    phoneFormat: '+263 7X XXX XXXX',
  },
  {
    id: 'zipit',
    name: 'ZipIt',
    icon: 'Banknote',
    description: 'Instant bank transfer via ZipIt',
    enabled: true,
    type: 'bank',
    phoneFormat: '+263 7X XXX XXXX',
  },
  {
    id: 'innbucks',
    name: 'Innbucks',
    icon: 'Wallet',
    description: 'Pay with Innbucks',
    enabled: true,
    type: 'mobile',
    phoneFormat: '+263 7X XXX XXXX',
  },
  // Add more payment methods below
  // {
  //   id: 'onemoney',
  //   name: 'OneMoney',
  //   icon: 'Smartphone',
  //   description: 'Pay from your OneMoney wallet',
  //   enabled: false,
  //   type: 'mobile',
  // },
];

export const getEnabledPaymentMethods = () => 
  paymentMethods.filter((method) => method.enabled);

export const getPaymentMethod = (id: string) =>
  paymentMethods.find((method) => method.id === id);
