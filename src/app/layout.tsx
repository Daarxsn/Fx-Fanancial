import type { Metadata } from "next";
import { Open_Sans, Sansation, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import "./globals.css";

const openSans = Open_Sans({ variable: "--font-open-sans", subsets: ["latin"], weight: ["300", "400", "500", "600", "700", "800"], display: "swap" });

const sansation = Sansation({ variable: "--font-sansation", subsets: ["latin"], weight: ["300", "400", "700"], display: "swap" });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Falchion Finance | Invoice Workspace",
    template: "%s | Falchion Finance",
  },
  description: "Internal finance workspace for Falchion Xeniaa.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${openSans.variable} ${sansation.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
