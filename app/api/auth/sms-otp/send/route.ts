import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";

export const runtime = "nodejs";
export const preferredRegion = "bom1";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const digits = String(body.phone || "").replace(/\D/g, "").slice(-10);
    if (!/^[6-9]\d{9}$/.test(digits)) {
      return NextResponse.json({ error: "Enter a valid 10-digit Indian mobile number." }, { status: 400 });
    }

    const apiKey = process.env.STARTMESSAGING_API_KEY;
    const configuredTemplateId = process.env.STARTMESSAGING_SMS_TEMPLATE_ID?.trim();
    // StartMessaging accepts templateId only as a UUID. Ignore malformed optional values
    // so an incorrect Vercel setting does not block every OTP send request.
    const templateId = configuredTemplateId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(configuredTemplateId)
      ? configuredTemplateId
      : undefined;
    if (!apiKey) {
      return NextResponse.json({ error: "SmartMessaging SMS is not configured. Add STARTMESSAGING_API_KEY in Vercel." }, { status: 503 });
    }

    const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const upstream = await fetch("https://api.startmessaging.com/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({
        phoneNumber: `+91${digits}`,
        ...(templateId ? { templateId } : {}),
        variables: { otp, appName: "YREL" }
      }),
      cache: "no-store"
    });
    const result = await upstream.json().catch(() => ({}));

    // StartMessaging Verify API expects the top-level requestId.
    // data.otpRequestId is a separate message identifier.
    const requestId = typeof result.requestId === "string" ? result.requestId : "";
    if (!upstream.ok || result.success !== true || !requestId) {
      console.error("SmartMessaging OTP send failed", {
        status: upstream.status,
        success: result?.success,
        message: result?.message || result?.error || "Provider returned no requestId"
      });
      return NextResponse.json({ error: result?.message || "Could not send SMS OTP. Please check your SmartMessaging account and SMS template." }, { status: 502 });
    }

    return NextResponse.json({ requestId, message: "SMS OTP sent." });
  } catch (error) {
    console.error("YREL SmartMessaging OTP send error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Unable to send SMS OTP right now. Please try again." }, { status: 500 });
  }
}
