import { redirect } from "next/navigation";
import AffiliateAdminClient from "./AffiliateAdminClient";
import { canAccessAdminPage, isAdminAccessConfigured } from "@/lib/admin-auth";

export default async function AffiliateAdminPage() {
  const configured = isAdminAccessConfigured();
  const allowed = await canAccessAdminPage();

  if (!configured || !allowed) {
    redirect("/affiliate/admin/auth");
  }

  return <AffiliateAdminClient />;
}
