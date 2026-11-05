"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../lib/language";
import { Landmark, ShieldCheck, Fingerprint, UserRound, CarFront, HeartPulse, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import catalog from "../public/services/catalog.json";
import BuildathonBadge from "../components/buildathon-badge";

const services = catalog.services.filter((service) => service.enabled);
const serviceIcons = [Fingerprint, UserRound, Landmark, CarFront, HeartPulse];

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
        <div className="hero-actions"><Link href="/copilot#intake" className="primary-link"><Sparkles size={18} />{t("home.cta_intake")}</Link><Link href="/services" className="secondary-link">{t("home.cta_browse")}</Link><span>{t("home.cta_sub")}</span></div>
        <div className="hero-note"><ShieldCheck size={18} /><span>{t("home.note")}</span></div>
      </div>
      <div className="hero-art" aria-label={currentLang === "bn" ? "সেবার স্লাইডার" : "Service carousel"}>
        <div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/>
        <div className="service-card" key={service.service_id}><span className="service-icon"><ServiceIcon size={30} /></span><small>{currentLang === "bn" ? "আপনার সেবা" : "YOUR SERVICES"}</small><b>{currentLang === "bn" ? service.service_name_bn : service.service_name_en}</b><p>{currentLang === "bn" ? service.summary_bn : service.summary_en}</p></div>
        <div className="service-controls"><button type="button" aria-label={currentLang === "bn" ? "আগের সেবা" : "Previous service"} onClick={() => setActiveService((activeService - 1 + services.length) % services.length)}><ChevronLeft size={17}/></button><span>{services.map((item, index) => <button key={item.service_id} type="button" aria-label={currentLang === "bn" ? item.service_name_bn : item.service_name_en} aria-current={index === activeService} onClick={() => setActiveService(index)} />)}</span><button type="button" aria-label={currentLang === "bn" ? "পরের সেবা" : "Next service"} onClick={() => setActiveService((activeService + 1) % services.length)}><ChevronRight size={17}/></button></div>
      </div>
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
      .home-footer { padding: 1.4rem 1.2rem; border-top: 1px solid #e5ebe6; color: #738078; background: #fff; text-align: center; font-size: .78rem; line-height: 1.7; }
      @keyframes arrive { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } @keyframes slide-in { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }
      @media (max-width: 760px) { .hero-wrap { min-height: unset; padding: 3.3rem 1.25rem; }.hero-art { width: 280px; min-height: 300px; flex: 0 0 280px; transform: scale(.86); transform-origin: center right; margin-left: -2rem; } }
      @media (max-width: 540px) { .hero-wrap { display: block; }.hero-art { width: 100%; min-height: 290px; margin: 1rem 0 0; }.hero-copy { font-size: .98rem; }.hero-actions { align-items: flex-start; flex-direction: column; gap: .65rem; } }
      @media (prefers-reduced-motion: reduce) { .hero-content,.service-card { animation: none; } }
    `}</style>
  </main>;
}
