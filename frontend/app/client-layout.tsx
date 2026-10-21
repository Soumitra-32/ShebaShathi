"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { LanguageProvider, useLanguage } from "../lib/language";
import "../lib/i18n";

/** Client-side nav with the global language switcher. */
function SiteNav() {
  const { t } = useTranslation("translation");
  const { lang, setLang } = useLanguage();
  const currentLang = lang;

  const navItems = [
    { href: "/services", key: "nav.services" },
    { href: "/wizard", key: "nav.wizard" },
    { href: "/redflag", key: "nav.fees" },
    { href: "/copilot", key: "nav.copilot" },
    { href: "/identity-check", key: "nav.identity-check" },
    { href: "/grs", key: "nav.grs" },
  ];

  return (
    <nav aria-label="প্রধান নেভিগেশন" className="site-nav print:hidden">
      <Link href="/" className="site-brand">
        <span className="brand-mark" aria-hidden="true">শ</span>
        <span>ShebaShathi <span className="brand-bd">BD</span></span>
      </Link>
      <div className="site-links">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className="nav-link">
            {t(item.key)}
          </Link>
        ))}
      </div>
      <div className="nav-controls">
        <button
          type="button"
          onClick={() => setLang(currentLang === "bn" ? "en" : "bn")}
          aria-label={currentLang === "bn" ? "অন্যান্য ভাষায় যান" : "Switch language"}
          className="min-h-11 shrink-0 rounded-lg border border-slate-300 bg-white px-4 font-medium text-slate-800"
        >
          {currentLang === "bn" ? t("common.language_en") : t("common.language_bn")}
        </button>
      </div>
    </nav>
  );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <SiteNav />
      {children}
    </LanguageProvider>
  );
}
