import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomBytes } from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const preferredRegion = "bom1";

const hashOtp = (phone: string, otp: string, secret: string) =>
  createHmac("sha256", secret).update(`yrel-partner-sms-otp:${phone}:${otp}`).digest("hex");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const digits = String(body.phone || "").replace(/\D/g, "").slice(-10);
    const otp = String(body.otp || "").trim();
    if (!/^[6-9]\d{9}$/.test(digits) || !/^\d{6}$/.test(otp)) {
      return NextResponse.json({ error: "Enter your 10-digit mobile number and 6-digit SMS OTP." }, { status: 400 });
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anon || !serviceKey) return NextResponse.json({ error: "Partner account service is not configured." }, { status: 503 });

    const phone = `+91${digits}`;
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: consumed, error: consumeError } = await admin.rpc("consume_yrel_partner_otp", {
      p_phone: phone, p_otp_hash: hashOtp(phone, otp, serviceKey)
    });
    if (consumeError) throw consumeError;
    if (consumed !== true) return NextResponse.json({ error: "The OTP is invalid or expired. Request a new OTP." }, { status: 400 });

    let partnerUser: any = null;
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      partnerUser = data.users.find(user => user.phone === phone && user.user_metadata?.account_type === "partner") || null;
      if (partnerUser || data.users.length < 1000) break;
    }
    if (!partnerUser) return NextResponse.json({ error: "This number is not registered as a YREL Partner." }, { status: 403 });

    const temporaryPassword = randomBytes(32).toString("hex");
    const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(partnerUser.id, {
      password: temporaryPassword, phone_confirm: true,
      user_metadata: { ...partnerUser.user_metadata, account_type: "partner", phone, phone_verified: true }
    });
    if (updateError) throw updateError;

    const client = createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: signedIn, error: signInError } = await client.auth.signInWithPassword({ phone, password: temporaryPassword });
    if (signInError || !signedIn.session) throw signInError || new Error("Could not create Partner session.");
    return NextResponse.json({ session: signedIn.session, userId: updated.user.id });
  } catch (error) {
    console.error("YREL Partner SMS verify error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Partner OTP verification or sign-in failed. Please try again." }, { status: 500 });
  }
}
