import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "crypto";

export const runtime = "nodejs";
export const preferredRegion = "bom1";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const digits = String(body.phone || "").replace(/\D/g, "");
    if (!/^[6-9]\d{9}$/.test(digits)) {
      return NextResponse.json({ error: "Enter a valid 10-digit Indian mobile number." }, { status: 400 });
    }

    const apiKey = process.env.STARTMESSAGING_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "SMS service is not configured. Add the StartMessaging API key in Vercel." }, { status: 503 });
    }

    const otp = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const upstream = await fetch("https://api.startmessaging.com/otp/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-API-Key": apiKey },
      body: JSON.stringify({
        phoneNumber: `+91${digits}`,
        variables: { otp }
      }),
      cache: "no-store"
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok || result.success === false) {
      console.error("StartMessaging SMS send failed", upstream.status, result?.message || result?.error || "provider error");
      return NextResponse.json({ error: "Could not send SMS OTP. Please check the StartMessaging SMS template and account." }, { status: upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502 });
    }

    const requestId = result.requestId || result.data?.otpRequestId;
    if (!requestId) {
      console.error("StartMessaging send response missing request ID", result);
      return NextResponse.json({ error: "SMS provider did not return an OTP request ID." }, { status: 502 });
    }

    return NextResponse.json({ requestId, message: "OTP sent by SMS." });
  } catch (error) {
    console.error("YREL SMS OTP send error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Unable to send OTP right now. Please try again." }, { status: 500 });
  }
}
