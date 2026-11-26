"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function VerifyPhonePage() {
  const [message, setMessage] = useState("Verifying your YREL mobile number…");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let active = true;
    const token = new URLSearchParams(window.location.search).get("token") || "";
    if (!token) {
      setMessage("This verification link is invalid or incomplete.");
      return;
    }

    fetch("/api/auth/phone-verification/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    })
      .then(async response => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Mobile verification failed.");
        if (!active) return;
        setDone(true);
        setMessage("Mobile number verified successfully. Please log in using your mobile number and password.");
        window.setTimeout(() => {
          window.location.replace(result.redirectTo || "/");
        }, 1800);
      })
      .catch(error => {
        if (active) setMessage(error instanceof Error ? error.message : "Mobile verification failed.");
      });

    return () => { active = false; };
  }, []);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#fff8ed" }}>
      <section style={{ width: "100%", maxWidth: 420, padding: 28, borderRadius: 22, background: "#fff", boxShadow: "0 12px 40px rgba(80,45,10,.10)", textAlign: "center" }}>
        <div style={{ width: 58, height: 58, margin: "0 auto 18px", borderRadius: 18, display: "grid", placeItems: "center", background: "#fff0df", color: "#ef6c24", fontSize: 28, fontWeight: 800 }}>Y</div>
        <h1 style={{ margin: "0 0 12px", color: "#30251d" }}>YREL Mobile Verification</h1>
        <p style={{ color: "#6d6258", lineHeight: 1.6 }}>{message}</p>
        {done && <p style={{ color: "#287a45", fontWeight: 700 }}>Redirecting to login…</p>}
        {!done && <Link href="/" style={{ display: "inline-block", marginTop: 14, color: "#d85d19" }}>Back to YREL</Link>}
      </section>
    </main>
  );
}
