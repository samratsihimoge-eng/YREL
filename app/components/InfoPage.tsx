"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Bell, CalendarDays, Headphones, Home, Menu, UserRound, MapPin, Info, Layers3, CarFront, Users, Globe2, ShieldCheck, FileText, XCircle, CircleHelp, ChevronRight, X } from "lucide-react";
import "./info-pages.css";

const items = [
 ["Saved Locations","/#saved-locations",MapPin],["How It Works","/how-it-works",Info],["All Services","/services",Layers3],["Cab Rentals","/#cab-rentals",CarFront],["Seat Sharing","/#seat-sharing",Users],["Privacy Policy","/privacy-policy",ShieldCheck],["Terms & Conditions","/terms-and-conditions",FileText],["Cancellation Policy","/cancellation-policy",XCircle],["Help & Support","/#support",Headphones],["About YREL","/#about",CircleHelp]
] as const;

export default function InfoPage({ title, eyebrow, children }: {title:string;eyebrow?:string;children:React.ReactNode}) {
 const [menuOpen,setMenuOpen]=useState(false);
 return <main className="yrel-approved-page">
  <header className="yrel-approved-header">
   <button type="button" className="yrel-approved-menu" aria-label="Menu" onClick={()=>setMenuOpen(true)}><Menu/></button>
   <Link href="/" className="yrel-approved-brand"><img src="https://raw.githubusercontent.com/samratsihimoge-eng/YREL/main/Yrel_logo_png.png" alt="YREL"/><span>Your City, Your Fun.<br/><b>Just YREL it.</b></span></Link>
   <Link href="/#notifications" className="yrel-approved-head-action" aria-label="Notifications"><Bell/><i/></Link>
   <Link href="/#profile" className="yrel-approved-profile" aria-label="Profile"><UserRound/></Link>
  </header>
  <div className="yrel-approved-titlebar"><Link href="/" aria-label="Back"><ArrowLeft/></Link><span>{eyebrow || "✦"}</span><h1>{title}</h1></div>
  <div className="yrel-approved-content">{children}</div>
  <nav className="yrel-approved-bottom" aria-label="Main navigation">
   <Link href="/"><Home/><span>Home</span></Link>
   <Link href="/#bookings"><CalendarDays/><span>My Bookings</span></Link>
   <Link href="/#support"><Headphones/><span>Support</span></Link>
   <Link href="/#notifications"><Bell/><span>Notifications</span></Link>
  </nav>
  {menuOpen && <div className="yrel-menu-overlay" onClick={()=>setMenuOpen(false)}><section className="yrel-menu-sheet" onClick={e=>e.stopPropagation()}><div className="yrel-menu-sheet-head"><b>☰　Menu</b><button onClick={()=>setMenuOpen(false)} aria-label="Close menu"><X/></button></div>{items.map(([label,href,Icon])=><Link href={href} key={label} onClick={()=>setMenuOpen(false)}><Icon/><span>{label}</span><ChevronRight/></Link>)}<div className="yrel-menu-language"><Globe2/><b>Language</b><span>English</span><span>ಕನ್ನಡ</span><span>हिंदी</span></div></section></div>}
 </main>;
}
