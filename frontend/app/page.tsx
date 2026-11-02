"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../lib/language";
import { ArrowUpRight, ClipboardCheck, HelpCircle, FileText, Landmark, ClipboardList, ShieldCheck, Fingerprint, UserRound, CarFront, HeartPulse, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import catalog from "../public/services/catalog.json";
import IntakeCard from "../components/intake-card";
import BuildathonBadge from "../components/buildathon-badge";

const services = catalog.services.filter((service) => service.enabled);
const serviceIcons = [Fingerprint, UserRound, Landmark, CarFront, HeartPulse];

const tools = [
  { href: "/services", titleKey: "home.tools_services", descriptionKey: "home.tools_services_desc", icon: Landmark },
  { href: "/services/epassport/guide", titleKey: "home.tools_wizard", descriptionKey: "home.tools_wizard_desc", icon: ClipboardCheck },
  { href: "/copilot", titleKey: "home.tools_copilot", descriptionKey: "home.tools_copilot_desc", icon: HelpCircle },
  { href: "/redflag", titleKey: "home.tools_redflag", descriptionKey: "home.tools_redflag_desc", icon: ShieldCheck },
  { href: "/identity-check", titleKey: "home.tools_identity", descriptionKey: "home.tools_identity_desc", icon: ClipboardList },
  { href: "/grs", titleKey: "home.tools_grs", descriptionKey: "home.tools_grs_desc", icon: FileText },
];

export default function HomePage() {
  const { t } = useTranslation("translation");
  const { lang } = useLanguage();
  const currentLang = lang;
  const [activeService, setActiveService] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || services.length < 2) return;
    const timer = window.setInterval(() => setActiveService((index) => (index + 1) % services.length), 4500);
    return () => window.clearInterval(timer);
  }, []);
  const service = services[activeService];
  const ServiceIcon = serviceIcons[activeService % serviceIcons.length];

  return <main>
    <section className="hero-wrap">
      <div className="hero-content">
        <BuildathonBadge variant="hero" />
        <p className="eyebrow">{t("home.eyebrow")}</p>
        <h1>{t("home.title_line1")}<br /><span>{t("home.title_line2")}</span></h1>
        <p className="hero-copy">{t("home.copy")}</p>
        <div className="hero-actions"><Link href="#intake" className="primary-link"><Sparkles size={18} />{t("home.cta_intake")}</Link><Link href="/services" className="secondary-link">{t("home.cta_browse")}</Link><span>{t("home.cta_sub")}</span></div>
        <div className="hero-note"><ShieldCheck size={18} /><span>{t("home.note")}</span></div>
      </div>
      <div className="hero-art" aria-label={currentLang === "bn" ? "সেবার স্লাইডার" : "Service carousel"}>
        <div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/>
        <div className="service-card" key={service.service_id}><span className="service-icon"><ServiceIcon size={30} /></span><small>{currentLang === "bn" ? "আপনার সেবা" : "YOUR SERVICES"}</small><b>{currentLang === "bn" ? service.service_name_bn : service.service_name_en}</b><p>{currentLang === "bn" ? service.summary_bn : service.summary_en}</p></div>
        <div className="service-controls"><button type="button" aria-label={currentLang === "bn" ? "আগের সেবা" : "Previous service"} onClick={() => setActiveService((activeService - 1 + services.length) % services.length)}><ChevronLeft size={17}/></button><span>{services.map((item, index) => <button key={item.service_id} type="button" aria-label={currentLang === "bn" ? item.service_name_bn : item.service_name_en} aria-current={index === activeService} onClick={() => setActiveService(index)} />)}</span><button type="button" aria-label={currentLang === "bn" ? "পরের সেবা" : "Next service"} onClick={() => setActiveService((activeService + 1) % services.length)}><ChevronRight size={17}/></button></div>
      </div>
    </section>
    <IntakeCard />
    <section className="tools-section">
      <div className="section-heading"><div><p className="eyebrow">{t("home.tools_eyebrow")}</p><h2>{t("home.tools_title")}</h2></div><p>{t("home.tools_sub")}</p></div>
      <div className="tool-grid">{tools.map(({ href, titleKey, descriptionKey, icon: Icon }, index) => <Link key={href} href={href} className="tool-card" style={{ animationDelay: `${index * 65}ms` }}><span className="tool-icon"><Icon size={21} strokeWidth={1.8} /></span><span className="tool-arrow"><ArrowUpRight size={17} /></span><h3>{t(titleKey)}</h3><p>{t(descriptionKey)}</p></Link>)}</div>
    </section>
    <footer className="home-footer">{t("common.disclaimer")}</footer>
    <style jsx>{`
      .hero-wrap { position: relative; display: flex; min-height: 430px; overflow: hidden; align-items: center; justify-content: space-between; gap: 2rem; padding: 4.4rem max(1.25rem, calc((100vw - 1080px) / 2)); background: radial-gradient(ellipse at 82% 40%, #dceee3 0%, transparent 35%), linear-gradient(115deg,#fbfdfb 5%,#edf5ef 100%); }
      .hero-content { position: relative; z-index: 1; max-width: 610px; animation: arrive .55s ease both; }
      .eyebrow { margin: 0 0 .9rem; color: #267351; font-size: .84rem; font-weight: 750; letter-spacing: .025em; }
      h1 { margin: 0; color: #18372a; font-size: clamp(2.4rem,5vw,3.65rem); font-weight: 800; letter-spacing: -.045em; line-height: 1.23; }
      h1 span { color: #28805a; }
      .hero-copy { max-width: 510px; margin: 1.1rem 0 1.5rem; color: #5a6b61; font-size: 1.05rem; line-height: 1.9; }
      .hero-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem; }
      .primary-link { display: inline-flex; align-items: center; gap: .6rem; border-radius: 11px; padding: .83rem 1.15rem; color: white; background: #176b4b; box-shadow: 0 6px 16px #176b4b2a; font-weight: 700; text-decoration: none; transition: transform .2s, background .2s; }
      .primary-link:hover { transform: translateY(-2px); background: #10583d; }
      .secondary-link { color: #236444; font-size: .86rem; font-weight: 700; text-decoration: underline; text-underline-offset: 3px; }
      .secondary-link:hover { color: #104d34; }
      .hero-actions > span { color: #65766d; font-size: .82rem; }
      .hero-note { display: flex; align-items: center; gap: .5rem; margin-top: 1.45rem; color: #47745c; font-size: .85rem; }
      .hero-art { position: relative; width: 370px; min-height: 320px; flex: 0 0 370px; display: flex; flex-direction: column; align-items: center; justify-content: center; } .service-controls { position: relative; z-index: 1; display: flex; align-items: center; gap: .75rem; margin-top: .7rem; }.service-controls button { display: grid; width: 30px; height: 30px; place-items: center; border: 1px solid #a9c9b3; border-radius: 50%; color: #276648; background: #ffffffc9; cursor: pointer; }.service-controls span { display: flex; gap: .38rem; }.service-controls span button { width: 8px; height: 8px; padding: 0; border: 0; background: #9bbba4; }.service-controls span button[aria-current="true"] { width: 20px; border-radius: 8px; background: #287955; }
      .art-orbit { position: absolute; border: 1px solid #7bad8d55; border-radius: 50%; transform: rotate(-22deg); }
      .orbit-one { inset: 0 8px; }.orbit-two { inset: 28px -10px; transform: rotate(24deg); }
      .service-card { position: relative; z-index: 1; display: flex; width: 255px; min-height: 232px; flex-direction: column; align-items: center; justify-content: center; gap: .5rem; padding: 1.1rem; border: 1px solid #ffffff66; border-radius: 20px; color: #f5fff8; background: linear-gradient(145deg,#287955,#155438); box-shadow: 0 22px 38px #183e2d30; text-align: center; animation: slide-in .38s ease both; } .service-icon { display: grid; width: 52px; height: 52px; place-items: center; border: 1px solid #d7e9b788; border-radius: 16px; color: #e0efc9; }.service-card small { font-size: .62rem; letter-spacing: .18em; opacity: .8; }.service-card b { font-size: 1.15rem; }.service-card p { display: -webkit-box; overflow: hidden; margin: .15rem 0 0; font-size: .76rem; line-height: 1.55; opacity: .88; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
      .passport-card span { font-size: .78rem; }.passport-card b { font-size: 1.18rem; }.passport-card small { margin-top: .55rem; font-size: .63rem; letter-spacing: .2em; opacity: .8; }.passport-seal { display: grid; width: 45px; height: 45px; place-items: center; border: 1px solid #d7e9b788; border-radius: 50%; color: #e0efc9; font-size: 1.45rem; }
      .art-dot { position: absolute; width: 13px; height: 13px; border-radius: 50%; background: #77ad86; box-shadow: 0 0 0 7px #77ad8620; }.dot-one { top: 23px; right: 40px; }.dot-two { bottom: 32px; left: 22px; width: 9px; height: 9px; }
      .tools-section { max-width: 1152px; margin: auto; padding: 3.3rem 1.25rem 3.5rem; }
      .section-heading { display: flex; align-items: end; justify-content: space-between; gap: 1rem; margin-bottom: 1.45rem; }.section-heading .eyebrow { margin-bottom: .35rem; }.section-heading h2 { margin: 0; color: #1d382b; font-size: 1.75rem; letter-spacing: -.03em; }.section-heading > p { margin: 0 0 .3rem; color: #6c7c73; font-size: .9rem; }
      .tool-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 1rem; }
      .tool-card { position: relative; min-height: 175px; padding: 1.25rem; border: 1px solid #e2eae4; border-radius: 15px; background: #fff; box-shadow: 0 3px 12px #183a2810; text-decoration: none; animation: arrive .45s ease both; transition: transform .2s, box-shadow .2s, border-color .2s; }
      .tool-card:hover { transform: translateY(-4px); border-color: #b8d6c2; box-shadow: 0 12px 28px #183a2815; }
      .tool-icon { display: grid; width: 40px; height: 40px; place-items: center; border-radius: 12px; color: #267451; background: #edf6ef; }.tool-arrow { position: absolute; top: 1.35rem; right: 1.3rem; color: #8b9a91; }
      .tool-card h3 { margin: 1rem 0 .35rem; color: #21382c; font-size: 1.04rem; font-weight: 750; }.tool-card p { max-width: 330px; margin: 0; color: #68776e; font-size: .88rem; line-height: 1.75; }
      .home-footer { padding: 1.4rem 1.2rem; border-top: 1px solid #e5ebe6; color: #738078; background: #fff; text-align: center; font-size: .78rem; line-height: 1.7; }
      @keyframes arrive { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } @keyframes slide-in { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
      @media (max-width: 760px) { .hero-wrap { min-height: unset; padding: 3.3rem 1.25rem; }.hero-art { width: 280px; min-height: 300px; flex: 0 0 280px; transform: scale(.86); transform-origin: center right; margin-left: -2rem; }.tools-section { padding-top: 2.6rem; }.tool-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
      @media (max-width: 540px) { .hero-wrap { display: block; }.hero-art { width: 100%; min-height: 290px; margin: 1rem 0 0; }.hero-copy { font-size: .98rem; }.hero-actions { align-items: flex-start; flex-direction: column; gap: .65rem; }.section-heading { align-items: flex-start; flex-direction: column; gap: .3rem; }.tool-grid { grid-template-columns: 1fr; }.tool-card { min-height: 150px; } }
      @media (prefers-reduced-motion: reduce) { .hero-content,.tool-card,.service-card { animation: none; } }
    `}</style>
  </main>;
}
