import type { Metadata } from "next";
import { ActivateForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Activate account", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function ActivatePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const params = await searchParams;
  return <div className="auth-page"><ActivateForm token={params.token ?? ""} /></div>;
}
