import { NextRequest, NextResponse } from "next/server";
import { createHmac, randomInt } from "crypto";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const preferredRegion = "bom1";

const DEFAULT_TEMPLATE_ID = "0afbdeb0-785d-4dd0-bd48-365a182df276";
const OTP_TTL_MINUTES = 5;
const RESEND_COOLDOWN_SECONDS = 30;

function hashOtp(phone: string, otp: string, secret: string) {
  return createHmac("sha256", secret).update(`yrel-sms-otp:${phone}:${otp}`).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const digits = String(body.phone || "").replace(/\D/g, "").slice(-10);
    if (!/^[6-9]\d{9}$/.test(digits)) {
      return NextResponse.json({ error: "Enter a valid 10-digit Indian mobile number." }, { status: 400 });
    }

    const apiKey = process.env.STARTMESSAGING_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!apiKey || !supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "SMS or customer account service is not configured." }, { status: 503 });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const phone = `+91${digits}`;

    const { data: previous, error: previousError } = await admin
      .from("yrel_otp_challenges")
      .select("created_at")
      .eq("phone", phone)
      .maybeSingle();
    if (previousError) throw previousError;

    if (previous?.created_at) {
      const elapsedSeconds = (Date.now() - new Date(previous.created_at).getTime()) / 1000;
      if (elapsedSeconds < RESEND_COOLDOWN_SECONDS) {
        return NextResponse.json({
          error: `Please wait ${Math.ceil(RESEND_COOLDOWN_SECONDS - elapsedSeconds)} seconds before requesting another OTP.`
        }, { status: 429 });
      }
    }

    const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const otpHash = hashOtp(phone, otp, serviceKey);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

    const { error: storeError } = await admin.from("yrel_otp_challenges").upsert({
      phone,
      otp_hash: otpHash,
      expires_at: expiresAt,
      attempts: 0,
      created_at: new Date().toISOString()
    }, { onConflict: "phone" });
    if (storeError) throw storeError;

    const configuredTemplateId = process.env.STARTMESSAGING_SMS_TEMPLATE_ID?.trim();
    const templateId = configuredTemplateId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(configuredTemplateId)
      ? configuredTemplateId
      : DEFAULT_TEMPLATE_ID;

    const upstream = await fetch("https://api.startmessaging.com/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({
        phoneNumber: phone,
        templateId,
        variables: { otp, appName: "YREL" }
      }),
      cache: "no-store"
    });
    const result = await upstream.json().catch(() => ({}));

    if (!upstream.ok || result.success !== true) {
      await admin.from("yrel_otp_challenges").delete().eq("phone", phone);
      console.error("StartMessaging OTP send failed", {
        status: upstream.status,
        success: result?.success,
        message: result?.message || result?.error || "Provider rejected the SMS request"
      });
      return NextResponse.json({
        error: result?.message || "Could not send SMS OTP. Please check your StartMessaging account and SMS template."
      }, { status: 502 });
    }

    return NextResponse.json({
      message: "SMS OTP sent.",
      expiresInSeconds: OTP_TTL_MINUTES * 60
    });
  } catch (error) {
    console.error("YREL SMS OTP send error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Unable to send SMS OTP right now. Please try again." }, { status: 500 });
  }
}
