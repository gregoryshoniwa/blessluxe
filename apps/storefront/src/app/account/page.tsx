import Link from 'next/link';

export default function AccountPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-[5%] py-20">
      <div className="text-center max-w-md">
        <p className="font-script text-3xl text-gold mb-4">Coming Soon</p>
        <h1 className="font-display text-3xl tracking-widest uppercase mb-6">
          My Account
        </h1>
        <p className="text-black/60 mb-8">
          Sign in to view your orders, manage your wishlist, and update your account details.
        </p>
        <Link
          href="/shop"
          className="inline-block bg-gold text-white px-10 py-4 text-sm font-semibold tracking-widest uppercase hover:bg-gold-dark transition-colors"
        >
          Continue Shopping
        </Link>
      </div>
    </div>
  );
}
