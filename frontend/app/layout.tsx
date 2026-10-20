import type { Metadata } from "next";
import "@fontsource/noto-sans-bengali/bengali-400.css";
import "@fontsource/noto-sans-bengali/bengali-700.css";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "ShebaShathi BD — Citizen Services Helper",
  description: "Bangladesh citizen-services helper - e-Passport, birth registration, NID, and driving licence guides, official fees, RAG copilot, and GRS complaint drafter.",
  manifest: "/manifest.json",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="bn">
      <body className="font-sans">
        <div className="site-shell">
          <nav aria-label="প্রধান নেভিগেশন" className="site-nav print:hidden">
            <Link href="/" className="site-brand"><span className="brand-mark" aria-hidden="true">শ</span><span>ShebaShathi <span className="brand-bd">BD</span></span></Link>
            <div className="site-links">
              <Link href="/services">সেবাসমূহ</Link><Link href="/wizard">পাসপোর্ট প্রস্তুতি</Link><Link href="/fees">ফি</Link><Link href="/copilot">তথ্য সহায়ক</Link><Link href="/redflag">ফি যাচাই</Link><Link href="/identity-check">তথ্য মিল</Link><Link href="/grs">অভিযোগের খসড়া</Link>
            </div>
          </nav>
          {children}
        </div>
      </body>
    </html>
  );
}
