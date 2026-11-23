import Link from "next/link";

export default function Page() {
  return <main style={{minHeight:"100vh",background:"#fffaf5",color:"#34251e",padding:"24px 16px 56px"}}>
    <div style={{maxWidth:820,margin:"0 auto"}}>
      <Link href="/" style={{color:"#c95732",textDecoration:"none",fontWeight:700}}>← Back to YREL</Link>
      <header style={{padding:"28px 0 20px"}}>
        <div style={{color:"#d46a3b",fontSize:12,fontWeight:800,letterSpacing:2}}>YREL CUSTOMER INFORMATION</div>
        <h1 style={{fontSize:"clamp(30px,7vw,42px)",lineHeight:1.1,margin:"10px 0"}}>Cancellation Policy</h1>
        <p style={{color:"#78665b",margin:0}}>YREL TECHNOLOGIES PRIVATE LIMITED</p>
      </header>
      <section style={{background:"#fff",border:"1px solid #f0e3d9",borderRadius:20,padding:"22px 18px",boxShadow:"0 8px 24px rgba(80,45,25,.04)"}}>
        {items.map(([h,b])=><article key={h} style={{marginBottom:19}}><h2 style={{fontSize:17,margin:"0 0 7px",color:"#463126"}}>{h}</h2><p style={{margin:0,color:"#6d5b50",lineHeight:1.75,fontSize:14}}>{b}</p></article>)}
      </section>
      <section style={{background:"#fff0e4",borderRadius:20,padding:20,marginTop:18,lineHeight:1.8}}>
        <b>YREL Support</b><p style={{margin:"4px 0"}}>Email: <a href="mailto:yrelcabs@gmail.com" style={{color:"#b84d2c"}}>yrelcabs@gmail.com</a></p>
        <p style={{margin:0}}>WhatsApp: <a href="https://wa.me/919742809306" target="_blank" rel="noreferrer" style={{color:"#b84d2c"}}>+91 97428 09306</a></p>
      </section>
      <footer style={{textAlign:"center",color:"#88766b",fontSize:12,paddingTop:24}}>© {new Date().getFullYear()} YREL TECHNOLOGIES PRIVATE LIMITED</footer>
    </div>
  </main>;
}