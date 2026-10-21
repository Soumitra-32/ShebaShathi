import type { Metadata } from "next";
import "@fontsource/noto-sans-bengali/bengali-400.css";
import "@fontsource/noto-sans-bengali/bengali-700.css";
import "./globals.css";
import ClientLayout from "./client-layout";

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
          <ClientLayout>{children}</ClientLayout>
        </div>
      </body>
    </html>
  );
}
