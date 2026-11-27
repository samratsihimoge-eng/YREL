import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const preferredRegion = "bom1";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const digits = String(body.phone || "").replace(/\D/g, "").slice(-10);
    const requestId = String(body.requestId || "");
    const otp = String(body.otp || "").trim();

    if (!/^[6-9]\d{9}$/.test(digits) || !requestId || !/^\d{4,8}$/.test(otp)) {
      return NextResponse.json({ error: "Enter your mobile number and the OTP you received." }, { status: 400 });
    }

    const authkey = process.env.MSG91_AUTH_KEY;
    const widgetId = process.env.MSG91_WIDGET_ID;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!authkey || !widgetId || !supabaseUrl || !anonKey || !serviceKey) {
      return NextResponse.json({ error: "MSG91 or customer account service is not configured." }, { status: 503 });
    }

    const upstream = await fetch("https://api.msg91.com/api/v5/widget/verifyOtp", {
      method: "POST",
      headers: { "Content-Type": "application/json", authkey },
      body: JSON.stringify({ widgetId, reqId: requestId, otp }),
      cache: "no-store"
    });
    const verification = await upstream.json().catch(() => ({}));
    if (!upstream.ok || verification.type !== "success") {
      console.error("MSG91 OTP verification rejected", upstream.status, verification?.message || verification?.error || "invalid OTP");
      return NextResponse.json({ error: verification?.message || "The OTP is incorrect or expired. Request a new OTP and try again." }, { status: 400 });
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
        password: temporaryPassword, phone_confirm: true,
        user_metadata: { ...user.user_metadata, account_type: "customer", phone, phone_verified: true }
      });
      if (error) throw error;
      user = data.user;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        phone, phone_confirm: true, password: temporaryPassword,
        user_metadata: { account_type: "customer", phone, phone_verified: true }
      });
      if (error) throw error;
      user = data.user;
    }

    const { data: signedIn, error: signInError } = await publicAuth.auth.signInWithPassword({ phone, password: temporaryPassword });
    if (signInError || !signedIn.session) throw signInError || new Error("Could not create customer session.");
    return NextResponse.json({ session: signedIn.session, userId: user.id });
  } catch (error) {
    console.error("YREL MSG91 OTP verify error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "OTP verification completed, but YREL could not complete sign-in. Please try again." }, { status: 500 });
  }
}
