import { Button } from "@blessluxe/ui";

export default function Dashboard() {
  return (
    <main className="flex min-h-screen flex-col gap-8 p-8">
      <header className="flex items-center justify-between border-b border-cream-dark pb-6">
        <h1 className="font-display text-3xl font-semibold">
          BLESSLUXE Admin
        </h1>
        <Button variant="outline" size="sm">
          Sign Out
        </Button>
      </header>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="rounded-lg border border-cream-dark p-6">
          <p className="text-sm text-black/50">Total Orders</p>
          <p className="font-display text-3xl font-semibold">0</p>
        </div>
        <div className="rounded-lg border border-cream-dark p-6">
          <p className="text-sm text-black/50">Revenue</p>
          <p className="font-display text-3xl font-semibold">$0.00</p>
        </div>
        <div className="rounded-lg border border-cream-dark p-6">
          <p className="text-sm text-black/50">Products</p>
          <p className="font-display text-3xl font-semibold">0</p>
        </div>
      </div>
    </main>
  );
}
