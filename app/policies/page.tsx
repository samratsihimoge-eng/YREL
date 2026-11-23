"use client";

import Link from "next/link";
import { useState } from "react";

const sections = [
  { id: "cancellation", title: "Cancellation Policy", items: [
    ["Before driver arrival", "You may cancel before the assigned driver reaches your pickup location. No cancellation fee applies."],
    ["After driver arrival", "If you cancel after the driver has reached your pickup location, a cancellation fee of ₹30 applies."],
    ["No driver accepts", "If no driver accepts an Instant Cab or Cab Rental request within the one-minute search period, YREL will notify you. No cancellation fee applies."],
    ["Cancellation reason and confirmation", "Select a reason: plan changed; found another cab or platform; driver delay or not responding; or other. You may add a comment for “other”. YREL will ask you to confirm before submitting the cancellation."],
    ["Advance and other bookings", "Any cancellation or refund terms for Advance bookings, Driver bookings, Rentals or Seat Sharing will be shown in the booking flow or communicated before they are applied. Review the terms displayed for your booking."]
  ]},
  { id: "terms", title: "Terms & Conditions", items: [
    ["About YREL", "YREL is a service platform operated by YREL TECHNOLOGIES PRIVATE LIMITED for cab rides, professional drivers, cab rentals and, where available, Seat Sharing."],
    ["Account and information", "Provide accurate contact and booking information, keep your details updated and use your account responsibly."],
    ["Booking requests", "Bookings depend on service availability and driver acceptance or assignment. Instant Cab and Cab Rental requests may search for a driver for up to one minute. If no driver accepts, YREL will notify you. For Advance bookings, driver assignment may happen later and will be communicated to you."],
    ["Instant Driver requests", "The requested service time must be at least one hour ahead. YREL aims to confirm a driver within one hour. This is a driver-confirmation target, not a promise that the driver will arrive within one hour; arrival time may vary."],
    ["Driver details and OTP", "When assigned, driver name, vehicle details, registration number and photo may be shown where available. If an OTP is provided for a trip, share it only with your assigned driver when appropriate. The driver must not start an OTP-protected ride before you provide the OTP."],
    ["Location and tracking", "Pickup and destination details, and location permission if granted, may be used for location selection, route estimation and trip coordination. Live tracking is available where supported."],
    ["Fares and extra charges", "Displayed fares are estimates based on the selected service and booking details. Additional distance, time, toll, parking or other charges may apply only as disclosed in the applicable fare details."],
    ["Customer responsibilities", "Be available at the pickup point, provide correct trip details, treat drivers respectfully and use YREL lawfully and safely."],
    ["Availability and changes", "Driver availability, vehicle types, routes and features may vary by location and time. YREL may update or change services when reasonably required."],
    ["Cancellations and support", "Cancellations are governed by the YREL Cancellation Policy and booking-specific terms shown before confirmation. Contact yrelcabs@gmail.com or WhatsApp +91 97428 09306 for support."]
  ]},
  { id: "privacy", title: "Privacy Policy", items: [
    ["Information collected", "Depending on your use of YREL, information may include your name, mobile number, optional email address, customer ID, booking details, pickup and destination, location coordinates, booking history, emergency contacts you provide and support messages."],
    ["How information is used", "Information is used to manage your account, process bookings, estimate routes and fares, coordinate driver assignment, send booking updates, manage cancellations, prepare receipts, provide support, maintain security and improve services."],
    ["Location", "If you grant location permission, your device location may help identify your pickup point and coordinate a trip. You may enter a location manually where that option is available."],
    ["Sharing with drivers and partners", "Relevant booking and contact details may be shared with the driver or service partner assigned to fulfil your booking, to the extent needed to provide the service."],
    ["Emergency contacts", "If you add an emergency contact, you confirm that you are authorised to provide their details for the emergency-assistance purpose described in the app."],
    ["Messages and notifications", "YREL may send service messages about sign-in, booking status, driver assignment, OTP, cancellations and receipts. Promotional messages may be sent where permitted."],
    ["Storage and security", "YREL uses service providers and technical safeguards to operate the app and protect information. Information is retained for as long as reasonably required for service delivery, legal, accounting, dispute-resolution and security purposes."],
    ["Your requests", "You may contact YREL to request access to, correction of or deletion of personal information, subject to applicable legal and operational requirements. Identity verification may be required."],
    ["Children and policy updates", "YREL services are intended for people legally able to enter the relevant service arrangements. We may update this policy as services or legal requirements change; the latest version will appear here."]
  ]}
];

export default function PoliciesPage() {
  const [active, setActive] = useState("cancellation");
  return <main style={{minHeight:"100vh",background:"#fffaf5",color:"#34251e",padding:"24px 16px 56px"}}>
    <div style={{maxWidth:860,margin:"0 auto"}}>
      <Link href="/" style={{color:"#c95732",textDecoration:"none",fontWeight:700}}>← Back to YREL</Link>
      <header style={{padding:"28px 0 20px"}}>
        <div style={{color:"#d46a3b",fontSize:12,fontWeight:800,letterSpacing:2}}>YREL CUSTOMER INFORMATION</div>
        <h1 style={{fontSize:"clamp(30px,7vw,42px)",lineHeight:1.1,margin:"10px 0"}}>Policies & Help</h1>
        <p style={{color:"#78665b",margin:0}}>YREL TECHNOLOGIES PRIVATE LIMITED</p>
      </header>
      <nav aria-label="Policy sections" style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:22}}>
        {sections.map(s=><button key={s.id} onClick={()=>{setActive(s.id);document.getElementById(s.id)?.scrollIntoView({behavior:"smooth",block:"start"});}} style={{border:active===s.id?"1px solid #dc7043":"1px solid #ead9cc",borderRadius:999,padding:"10px 14px",background:active===s.id?"#ffeadb":"#fff",color:"#603b2b",fontWeight:700}}>{s.title}</button>)}
      </nav>
      {sections.map(s=><section id={s.id} key={s.id} style={{scrollMarginTop:18,background:"#fff",border:"1px solid #f0e3d9",borderRadius:20,padding:"22px 18px",marginBottom:18,boxShadow:"0 8px 24px rgba(80,45,25,.04)"}}>
        <h2 style={{color:"#bd512f",fontSize:24,margin:"0 0 18px"}}>{s.title}</h2>
        {s.items.map(([h,b])=><article key={h} style={{marginBottom:17}}><h3 style={{fontSize:16,margin:"0 0 6px",color:"#463126"}}>{h}</h3><p style={{margin:0,color:"#6d5b50",lineHeight:1.7,fontSize:14}}>{b}</p></article>)}
      </section>)}
      <section style={{background:"#fff0e4",borderRadius:20,padding:20,lineHeight:1.8}}>
        <h2 style={{margin:"0 0 8px",fontSize:20}}>Contact YREL Support</h2>
        <p style={{margin:"4px 0"}}>Email: <a href="mailto:yrelcabs@gmail.com" style={{color:"#b84d2c",fontWeight:700}}>yrelcabs@gmail.com</a></p>
        <p style={{margin:"4px 0"}}>WhatsApp: <a href="https://wa.me/919742809306" target="_blank" rel="noreferrer" style={{color:"#b84d2c",fontWeight:700}}>+91 97428 09306</a></p>
        <p style={{margin:"10px 0 0",color:"#78665b",fontSize:12}}>Please have these policy texts reviewed by a qualified legal professional before public launch. Booking-specific fees and refund terms should be clearly shown before confirmation.</p>
      </section>
      <footer style={{color:"#88766b",fontSize:12,textAlign:"center",paddingTop:24}}>© {new Date().getFullYear()} YREL TECHNOLOGIES PRIVATE LIMITED</footer>
    </div>
  </main>;
}
