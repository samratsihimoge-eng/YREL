import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

export const runtime = "nodejs";
export const preferredRegion = "bom1";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const digits = String(body.phone || "").replace(/\D/g, "");
    const passcode = String(body.passcode || "");
    const accountType = String(body.accountType || "customer");
    if (!/^[6-9]\d{9}$/.test(digits) || !/^\d{4}$/.test(passcode) || !["customer", "partner"].includes(accountType)) {
      return NextResponse.json({ error: "Enter your mobile number and 4-digit passcode." }, { status: 400 });
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !anonKey || !secret) return NextResponse.json({ error: "Login service is not configured." }, { status: 500 });
    const supabase = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const phone = "+91" + digits;
    const password = createHmac("sha256", secret).update(phone + ":" + passcode).digest("hex");
    const { data, error } = await supabase.auth.signInWithPassword({ phone, password });
    if (error || !data.user || !data.session) return NextResponse.json({ error: "Incorrect mobile number or passcode." }, { status: 401 });
    if (data.user.user_metadata?.account_type !== accountType) return NextResponse.json({ error: "This account is not registered for this YREL app." }, { status: 403 });
    if (!data.user.phone_confirmed_at) return NextResponse.json({ error: "Please verify your mobile number using the SMS link before login." }, { status: 403 });
    return NextResponse.json({ session: data.session });
  } catch (error) {
    console.error("YREL passcode login error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Login failed. Please try again." }, { status: 500 });
  }
}