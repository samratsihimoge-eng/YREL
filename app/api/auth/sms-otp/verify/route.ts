import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const preferredRegion = "bom1";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const digits = String(body.phone || "").replace(/\D/g, "");
    const requestId = String(body.requestId || "");
    const otpCode = String(body.otp || "").trim();

    if (!/^[6-9]\d{9}$/.test(digits) || !requestId || !/^\d{6}$/.test(otpCode)) {
      return NextResponse.json({ error: "Enter your mobile number and the 6-digit SMS OTP." }, { status: 400 });
    }

    const apiKey = process.env.STARTMESSAGING_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!apiKey || !supabaseUrl || !anonKey || !serviceKey) {
      return NextResponse.json({ error: "SMS or account service is not configured." }, { status: 503 });
    }

    const upstream = await fetch("https://api.startmessaging.com/otp/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ requestId, otpCode }),
      cache: "no-store"
    });
    const verification = await upstream.json().catch(() => ({}));
    if (!upstream.ok || verification.success !== true || verification.data?.verified !== true) {
      return NextResponse.json({ error: "The OTP is incorrect or expired. Please request a new code." }, { status: 400 });
    }

    const phone = `+91${digits}`;
    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const publicAuth = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });

    let user: any = null;
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      user = data.users.find((item) => item.phone === phone) || null;
      if (user || data.users.length < 1000) break;
    }

    if (user?.user_metadata?.account_type && user.user_metadata.account_type !== "customer") {
      return NextResponse.json({ error: "This number belongs to a different YREL account type." }, { status: 403 });
    }

    const temporaryPassword = randomBytes(32).toString("hex");
    if (user) {
      const { data, error } = await admin.auth.admin.updateUserById(user.id, {
        password: temporaryPassword,
        phone_confirm: true,
        user_metadata: { ...user.user_metadata, account_type: "customer", phone, phone_verified: true }
      });
      if (error) throw error;
      user = data.user;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        phone,
        phone_confirm: true,
        password: temporaryPassword,
        user_metadata: { account_type: "customer", phone, phone_verified: true }
      });
      if (error) throw error;
      user = data.user;
    }

    const { data: signedIn, error: signInError } = await publicAuth.auth.signInWithPassword({
      phone,
      password: temporaryPassword
    });
    if (signInError || !signedIn.session) throw signInError || new Error("Could not create customer session.");

    return NextResponse.json({ session: signedIn.session, userId: user.id });
  } catch (error) {
    console.error("YREL SMS OTP verify error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "OTP was verified, but YREL could not complete sign-in. Please try again." }, { status: 500 });
  }
}
