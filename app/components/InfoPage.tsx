"use client";

import Link from "next/link";

type InfoSection = { title: string; body: string; bullets?: string[] };
export default function InfoPage({ eyebrow, title, intro, sections, accent = "YREL" }: {
  eyebrow: string; title: string; intro: string; sections: InfoSection[]; accent?: string;
}) {
  return <main className="yrel-info">
    <header className="yrel-info-nav"><Link href="/" className="yrel-info-brand"><span className="yrel-info-mark">Y</span><span>YREL</span></Link><Link href="/" className="yrel-info-back">← Back to home</Link></header>
    <section className="yrel-info-hero"><span className="yrel-info-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{intro}</p><div className="yrel-info-pill">{accent} <span>•</span> Simple journeys, thoughtful service</div></section>
    <section className="yrel-info-grid">{sections.map((section,index)=><article className="yrel-info-card" key={section.title}><span className="yrel-info-number">{String(index+1).padStart(2,"0")}</span><h2>{section.title}</h2><p>{section.body}</p>{section.bullets?.length ? <ul>{section.bullets.map(item=><li key={item}>{item}</li>)}</ul> : null}</article>)}</section>
    <footer className="yrel-info-footer"><span>YREL · Your City, Your Fun. Just YREL it.</span><Link href="/">Explore YREL →</Link></footer>
    <style jsx global>{`
      .yrel-info{min-height:100vh;background:radial-gradient(ellipse at 88% 3%,rgba(255,177,112,.2),transparent 28%),#fffaf4;color:#2b1b14;padding:0 22px 50px;font-family:Arial,sans-serif}
      .yrel-info-nav{max-width:1120px;height:78px;margin:auto;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f0dfd0}
      .yrel-info-brand{display:flex;align-items:center;gap:10px;font-size:19px;font-weight:900;letter-spacing:.12em;color:#311b11}
      .yrel-info-mark{width:36px;height:36px;display:grid;place-items:center;border-radius:12px;background:linear-gradient(135deg,#ff8a28,#e94f12);color:white;font-size:21px}
      .yrel-info-back{font-size:13px;font-weight:700;color:#a34b1c}
      .yrel-info-hero{max-width:900px;margin:74px auto 44px;text-align:center}
      .yrel-info-eyebrow{display:inline-block;color:#d65b19;background:#fff0e2;border:1px solid #ffddc0;padding:8px 14px;border-radius:99px;font-size:11px;font-weight:800;letter-spacing:.16em;text-transform:uppercase}
      .yrel-info-hero h1{font-size:clamp(38px,7vw,68px);line-height:1.04;letter-spacing:-.055em;margin:20px 0 16px}
      .yrel-info-hero p{max-width:680px;margin:auto;color:#806452;font-size:17px;line-height:1.7}
      .yrel-info-pill{display:inline-flex;gap:10px;align-items:center;margin-top:24px;padding:10px 16px;border-radius:99px;background:white;border:1px solid #f0dfd0;color:#6f4b36;font-size:12px;font-weight:700}
      .yrel-info-pill span{color:#f07826}
      .yrel-info-grid{max-width:1120px;margin:auto;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
      .yrel-info-card{position:relative;overflow:hidden;background:rgba(255,255,255,.86);border:1px solid #f0dfd0;border-radius:22px;padding:28px;box-shadow:0 12px 36px rgba(74,43,22,.045)}
      .yrel-info-number{display:inline-grid;place-items:center;width:36px;height:36px;border-radius:12px;background:#fff0e2;color:#d65b19;font-size:12px;font-weight:900}
      .yrel-info-card h2{font-size:21px;letter-spacing:-.025em;margin:20px 0 9px}
      .yrel-info-card p,.yrel-info-card li{color:#806452;font-size:14px;line-height:1.75}
      .yrel-info-card ul{padding-left:19px;margin:12px 0 0}
      .yrel-info-card li{padding:3px 0}
      .yrel-info-footer{max-width:1120px;margin:38px auto 0;padding-top:22px;border-top:1px solid #f0dfd0;display:flex;justify-content:space-between;gap:16px;color:#947763;font-size:12px;font-weight:700}
      .yrel-info-footer a{color:#d65b19}
      @media(max-width:640px){.yrel-info{padding:0 16px 34px}.yrel-info-nav{height:66px}.yrel-info-hero{margin:48px auto 30px}.yrel-info-hero p{font-size:15px}.yrel-info-grid{grid-template-columns:1fr;gap:12px}.yrel-info-card{padding:22px;border-radius:18px}.yrel-info-footer{flex-direction:column}}
    `}</style>
  </main>;
}
