"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Bell, CalendarDays, CarFront, CarTaxiFront, CheckCircle2, ChevronRight, CircleHelp, FileText, Globe2, Headphones, Home, Info, Layers3, Lightbulb, MapPin, Menu, ShieldCheck, Users, UserRound, XCircle, Clock3, IndianRupee, CalendarCheck, Route, SteeringWheel } from "lucide-react";
import "./info-pages.css";

const menuItems = [
  ["Saved Locations", "/#saved-locations", MapPin],
  ["How It Works", "/how-it-works", Info],
  ["All Services", "/services", Layers3],
  ["Cab Rentals", "/#cab-rentals", CarFront],
  ["Seat Sharing", "/#seat-sharing", Users],
  ["Privacy Policy", "/privacy-policy", ShieldCheck],
  ["Terms & Conditions", "/terms-and-conditions", FileText],
  ["Cancellation Policy", "/cancellation-policy", XCircle],
  ["Help & Support", "/#support", Headphones],
  ["About YREL", "/#about", CircleHelp],
] as const;

export default function InfoPage({ title, eyebrow, children }: {title:string;eyebrow?:string;children:React.ReactNode}) {
 const pathname=usePathname();
 return <main className="yrel-approved-page">
  <header className="yrel-approved-header">
   <Link href="/" className="yrel-approved-menu" aria-label="Home"><Menu/></Link>
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
 </main>;
}
