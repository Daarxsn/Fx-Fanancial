import type { Metadata } from "next";
import { LoginForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Sign in", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function LoginPage() {
  return <div className="auth-page"><LoginForm /></div>;
}
