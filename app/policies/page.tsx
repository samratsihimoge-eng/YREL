import Link from "next/link";
const links = [
  ["/privacy-policy","Privacy Policy","How YREL handles customer information and location data."],
  ["/cancellation-policy","Cancellation Policy","Cancellation timing, the ₹30 after-arrival fee and booking-specific terms."],
  ["/terms-and-conditions","Terms & Conditions","Rules for using YREL customer services."],
];
export default function PoliciesIndex() {
 return <main style={{minHeight:"100vh",background:"#fffaf5",padding:"28px 16px",color:"#34251e"}}><div style={{maxWidth:760,margin:"0 auto"}}>
 <Link href="/" style={{color:"#c95732",textDecoration:"none",fontWeight:700}}>← Back to YREL</Link>
 <p style={{color:"#d46a3b",fontWeight:800,letterSpacing:2,fontSize:12,marginTop:32}}>YREL CUSTOMER INFORMATION</p>
 <h1 style={{fontSize:38,margin:"8px 0"}}>Policies & Help</h1><p style={{color:"#78665b"}}>YREL TECHNOLOGIES PRIVATE LIMITED</p>
 {links.map(([href,title,desc])=><Link key={href} href={href} style={{display:"block",padding:20,marginTop:14,background:"#fff",border:"1px solid #f0e3d9",borderRadius:18,color:"#34251e",textDecoration:"none"}}><b style={{color:"#bd512f",fontSize:18}}>{title}</b><p style={{margin:"7px 0 0",color:"#78665b",lineHeight:1.5}}>{desc}</p></Link>)}
 <div style={{background:"#fff0e4",borderRadius:18,padding:20,marginTop:20}}>Support: <a href="mailto:yrelcabs@gmail.com">yrelcabs@gmail.com</a> · <a href="https://wa.me/919742809306">WhatsApp +91 97428 09306</a></div>
 </div></main>;
}