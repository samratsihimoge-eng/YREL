import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomInt } from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const preferredRegion = "bom1";

const TTL_MINUTES = 5;
const COOLDOWN_SECONDS = 30;
const DEFAULT_TEMPLATE_ID = "0afbdeb0-785d-4dd0-bd48-365a182df276";
const hashOtp = (phone: string, otp: string, secret: string) =>
  createHmac("sha256", secret).update(`yrel-partner-sms-otp:${phone}:${otp}`).digest("hex");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const digits = String(body.phone || "").replace(/\D/g, "").slice(-10);
    if (!/^[6-9]\d{9}$/.test(digits)) return NextResponse.json({ error: "Enter a valid 10-digit Indian mobile number." }, { status: 400 });

    const apiKey = process.env.STARTMESSAGING_API_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!apiKey || !url || !serviceKey) return NextResponse.json({ error: "Partner SMS login is not configured." }, { status: 503 });

    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const phone = `+91${digits}`;
    let partnerUser: any = null;
    for (let page = 1; page <= 10; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw error;
      partnerUser = data.users.find(user => user.phone === phone && user.user_metadata?.account_type === "partner") || null;
      if (partnerUser || data.users.length < 1000) break;
    }
    if (!partnerUser) return NextResponse.json({ error: "This mobile number is not registered as a YREL Partner." }, { status: 404 });

    const { data: previous, error: previousError } = await admin.from("yrel_partner_otp_challenges").select("created_at").eq("phone", phone).maybeSingle();
    if (previousError) throw previousError;
    if (previous?.created_at) {
      const elapsed = (Date.now() - new Date(previous.created_at).getTime()) / 1000;
      if (elapsed < COOLDOWN_SECONDS) return NextResponse.json({ error: `Please wait ${Math.ceil(COOLDOWN_SECONDS - elapsed)} seconds before requesting another OTP.` }, { status: 429 });
    }

    const otp = String(randomInt(0, 1000000)).padStart(6, "0");
    const { error: storeError } = await admin.from("yrel_partner_otp_challenges").upsert({
      phone, otp_hash: hashOtp(phone, otp, serviceKey),
      expires_at: new Date(Date.now() + TTL_MINUTES * 60000).toISOString(),
      attempts: 0, created_at: new Date().toISOString()
    }, { onConflict: "phone" });
    if (storeError) throw storeError;

    const configured = process.env.STARTMESSAGING_SMS_TEMPLATE_ID?.trim();
    const templateId = configured && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(configured) ? configured : DEFAULT_TEMPLATE_ID;
    const upstream = await fetch("https://api.startmessaging.com/otp/send", {
      method: "POST", headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({ phoneNumber: phone, templateId, variables: { otp, appName: "YREL Partner" } }),
      cache: "no-store"
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok || result.success !== true) {
      await admin.from("yrel_partner_otp_challenges").delete().eq("phone", phone);
      console.error("YREL Partner SMS send rejected", { status: upstream.status, message: result?.message || result?.error });
      return NextResponse.json({ error: result?.message || "Could not send Partner SMS OTP." }, { status: 502 });
    }
    return NextResponse.json({ message: "Partner SMS OTP sent.", expiresInSeconds: TTL_MINUTES * 60 });
  } catch (error) {
    console.error("YREL Partner SMS send error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Unable to send Partner SMS OTP. Please try again." }, { status: 500 });
  }
}
