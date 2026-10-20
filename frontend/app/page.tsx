"use client";

import Link from "next/link";
import { ArrowUpRight, ClipboardCheck, HelpCircle, FileText, Landmark, ClipboardList, ShieldCheck, Wallet } from "lucide-react";

const tools = [
  { href: "/services", title: "সেবা নির্দেশিকা", description: "জন্ম নিবন্ধন, NID, ই-পাসপোর্ট ও ড্রাইভিং লাইসেন্সের নথি ও ধাপ দেখুন।", icon: Landmark },
  { href: "/wizard", title: "পাসপোর্ট প্রস্তুতি", description: "আপনার আবেদন অনুযায়ী ফি ও প্রয়োজনীয় নথির তালিকা তৈরি করুন।", icon: ClipboardCheck },
  { href: "/fees", title: "ফি ক্যালকুলেটর", description: "পৃষ্ঠা, মেয়াদ ও বিতরণ পদ্ধতি অনুযায়ী সরকারি ফি দেখুন।", icon: Wallet },
  { href: "/copilot", title: "তথ্য সহায়ক", description: "যাচাই করা সরকারি উৎস থেকে যেকোনো সেবা সম্পর্কে উত্তর খুঁজুন।", icon: HelpCircle },
  { href: "/redflag", title: "ফি যাচাই", description: "আপনাকে বলা অঙ্কটি প্রকাশিত সরকারি ফির সঙ্গে তুলনা করুন।", icon: ShieldCheck },
  { href: "/identity-check", title: "তথ্য মিল যাচাই", description: "শুধু আপনার ব্রাউজারে নাম ও তারিখের ভিন্নতা দেখুন; কোনো তথ্য পাঠানো হয় না।", icon: ClipboardList },
  { href: "/grs", title: "অভিযোগের খসড়া", description: "আপনার দেওয়া তথ্য দিয়ে একটি নিরপেক্ষ খসড়া তৈরি করুন।", icon: FileText },
];

export default function HomePage() {
  return <main>
    <section className="hero-wrap">
      <div className="hero-content">
        <p className="eyebrow">বাংলাদেশ নাগরিক সেবা সহায়তা</p>
        <h1>সরকারি সেবার প্রস্তুতি,<br /><span>এবার আরও সহজ।</span></h1>
        <p className="hero-copy">জন্ম নিবন্ধন, NID, পাসপোর্ট ও ড্রাইভিং লাইসেন্সের প্রয়োজনীয় নথি এবং পরবর্তী ধাপ—সহজ বাংলায়, যাচাই করা সরকারি সূত্রসহ এক জায়গায় জানুন।</p>
        <div className="hero-actions"><Link href="/services" className="primary-link">সেবা খুঁজুন <ArrowUpRight size={18} /></Link><span>বিনামূল্যে · কোনো অ্যাকাউন্ট লাগবে না</span></div>
        <div className="hero-note"><ShieldCheck size={18} /><span>সরকারি উৎসের তথ্য · যাচাইয়ের তারিখসহ</span></div>
      </div>
      <div className="hero-art" aria-hidden="true"><div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/><div className="passport-card"><span>বাংলাদেশ</span><b>পাসপোর্ট</b><div className="passport-seal">✳</div><small>E-PASSPORT</small></div><div className="art-dot dot-one"/><div className="art-dot dot-two"/></div>
    </section>
    <section className="tools-section">
      <div className="section-heading"><div><p className="eyebrow">আপনার প্রয়োজনের জন্য</p><h2>সহায়ক টুলগুলো</h2></div><p>প্রতিটি টুল আলাদাভাবে ব্যবহার করতে পারেন।</p></div>
      <div className="tool-grid">{tools.map(({ href, title, description, icon: Icon }, index) => <Link key={href} href={href} className="tool-card" style={{ animationDelay: `${index * 65}ms` }}><span className="tool-icon"><Icon size={21} strokeWidth={1.8} /></span><span className="tool-arrow"><ArrowUpRight size={17} /></span><h3>{title}</h3><p>{description}</p></Link>)}</div>
    </section>
    <footer className="home-footer">ShebaShathi BD একটি স্বাধীন নাগরিক সহায়তা টুল, সরকারি ওয়েবসাইট নয়। আবেদন করার আগে সর্বশেষ তথ্য সরকারি পোর্টালে যাচাই করুন।</footer>
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
      .hero-actions > span { color: #65766d; font-size: .82rem; }
      .hero-note { display: flex; align-items: center; gap: .5rem; margin-top: 1.45rem; color: #47745c; font-size: .85rem; }
      .hero-art { position: relative; width: 310px; height: 270px; flex: 0 0 310px; }
      .art-orbit { position: absolute; border: 1px solid #7bad8d55; border-radius: 50%; transform: rotate(-22deg); }
      .orbit-one { inset: 0 8px; }.orbit-two { inset: 28px -10px; transform: rotate(24deg); }
      .passport-card { position: absolute; top: 42px; left: 62px; display: flex; width: 185px; height: 190px; flex-direction: column; align-items: center; justify-content: center; gap: .4rem; border: 1px solid #ffffff66; border-radius: 18px; color: #f5fff8; background: linear-gradient(145deg,#287955,#155438); box-shadow: 0 22px 38px #183e2d30; transform: rotate(-8deg); animation: float 5s ease-in-out infinite; }
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
      @keyframes arrive { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } @keyframes float { 0%,100% { transform: translateY(0) rotate(-8deg); } 50% { transform: translateY(-7px) rotate(-6deg); } }
      @media (max-width: 760px) { .hero-wrap { min-height: unset; padding: 3.3rem 1.25rem; }.hero-art { width: 180px; height: 205px; flex: 0 0 180px; transform: scale(.78); transform-origin: center right; margin-left: -2rem; }.passport-card { left: 7px; top: 28px; }.tools-section { padding-top: 2.6rem; }.tool-grid { grid-template-columns: repeat(2,minmax(0,1fr)); } }
      @media (max-width: 540px) { .hero-wrap { display: block; }.hero-art { display: none; }.hero-copy { font-size: .98rem; }.hero-actions { align-items: flex-start; flex-direction: column; gap: .65rem; }.section-heading { align-items: flex-start; flex-direction: column; gap: .3rem; }.tool-grid { grid-template-columns: 1fr; }.tool-card { min-height: 150px; } }
      @media (prefers-reduced-motion: reduce) { .hero-content,.tool-card,.passport-card { animation: none; } }
    `}</style>
  </main>;
}
