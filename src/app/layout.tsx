import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Falchion Invoice",
  description: "Internal invoice management for Falchion Xeniaa.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
