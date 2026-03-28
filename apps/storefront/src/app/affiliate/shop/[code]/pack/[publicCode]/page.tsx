import { AffiliatePackCampaignClient } from "@/components/packs/AffiliatePackCampaignClient";

export const dynamic = "force-dynamic";

export default function AffiliatePackPage({ params }: { params: { code: string; publicCode: string } }) {
  const code = decodeURIComponent(params.code || "");
  const publicCode = decodeURIComponent(params.publicCode || "");

  return (
    <main className="min-h-screen theme-transition px-[5%] py-10" style={{ backgroundColor: "var(--theme-background)" }}>
      <AffiliatePackCampaignClient affiliateCode={code} publicCode={publicCode} />
    </main>
  );
}
