import { Button } from "@blessluxe/ui";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <h1 className="font-display text-6xl font-light text-gold-dark">
        BLESSLUXE
      </h1>
      <p className="font-body text-lg text-black/70">
        Luxury Women&apos;s Fashion — Coming Soon
      </p>
      <div className="flex gap-4">
        <Button variant="primary" size="lg">
          Shop Collection
        </Button>
        <Button variant="outline" size="lg">
          Learn More
        </Button>
      </div>
    </main>
  );
}
