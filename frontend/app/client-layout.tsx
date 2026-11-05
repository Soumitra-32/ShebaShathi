"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { LanguageProvider, useLanguage } from "../lib/language";
import { warmupBackend } from "../lib/api";
import "../lib/i18n";
import BuildathonBadge from "../components/buildathon-badge";

/** Client-side nav with one global language switcher and a collapsible menu. */
function SiteNav() {
  const { t, i18n } = useTranslation("translation");
  const { lang, setLang } = useLanguage();
  const currentLang = lang;
  const [menuOpen, setMenuOpen] = useState(false);

  // sync i18n language
  useEffect(() => {
    if (i18n.resolvedLanguage !== lang) {
      void i18n.changeLanguage(lang);
    }
  }, [i18n, lang]);

  // close on Escape
  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const navItems = [
    { href: "/copilot#intake", key: "nav.intake" },
    { href: "/services", key: "nav.services" },
    { href: "/services/epassport/status", key: "nav.status" },
    { href: "/redflag", key: "nav.fees" },
    { href: "/copilot", key: "nav.copilot" },
    { href: "/identity-check", key: "nav.identity-check" },
    { href: "/grs", key: "nav.grs" },
  ];

  return (
    <nav aria-label={t("nav.label")} className="site-nav print:hidden">
      <Link href="/" className="site-brand" onClick={() => setMenuOpen(false)}>
        <span className="brand-mark" aria-hidden="true">শ</span>
        <span>ShebaShathi <span className="brand-bd">BD</span></span>
      </Link>
      <BuildathonBadge variant="nav" />
      <div className="nav-controls">
        <button
          type="button"
          onClick={() => setLang(currentLang === "bn" ? "en" : "bn")}
          aria-label={currentLang === "bn" ? "অন্যান্য ভাষায় যান" : "Switch language"}
          className="nav-lang"
        >
          {currentLang === "bn" ? t("common.language_en") : t("common.language_bn")}
        </button>
        <button
          type="button"
          className="nav-menu-toggle"
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="site-menu"
          aria-label={menuOpen ? t("nav.close_menu") : t("nav.menu")}
        >
          {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </div>
      <div id="site-menu" className={`site-links ${menuOpen ? "is-open" : ""}`}>
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className="nav-link" onClick={() => setMenuOpen(false)}>
            {t(item.key)}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  // Wake the free-tier backend while the visitor browses (no user data sent).
  useEffect(() => {
    warmupBackend();
  }, []);
  return (
    <LanguageProvider>
      <SiteNav />
      {children}
    </LanguageProvider>
  );
}
