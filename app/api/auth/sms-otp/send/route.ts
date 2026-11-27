import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const preferredRegion = "bom1";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const digits = String(body.phone || "").replace(/\D/g, "").slice(-10);
    if (!/^[6-9]\d{9}$/.test(digits)) {
      return NextResponse.json({ error: "Enter a valid 10-digit Indian mobile number." }, { status: 400 });
    }

    const authkey = process.env.MSG91_AUTH_KEY;
    const widgetId = process.env.MSG91_WIDGET_ID;
    if (!authkey || !widgetId) {
      return NextResponse.json({ error: "MSG91 is not connected yet. Add MSG91_AUTH_KEY and MSG91_WIDGET_ID in Vercel after creating your OTP Widget." }, { status: 503 });
    }

    const upstream = await fetch("https://api.msg91.com/api/v5/widget/sendOtp", {
      method: "POST",
      headers: { "Content-Type": "application/json", authkey },
      body: JSON.stringify({ widgetId, identifier: `91${digits}` }),
      cache: "no-store"
    });
    const result = await upstream.json().catch(() => ({}));
    const reqId = result.message || result.data?.reqId || result.reqId;
    if (!upstream.ok || result.type !== "success" || !reqId) {
      console.error("MSG91 WhatsApp OTP send failed", upstream.status, result?.message || result?.error || "provider error");
      return NextResponse.json({ error: result?.message || "MSG91 could not send WhatsApp OTP. Check the widget's WhatsApp primary channel and account status." }, { status: 502 });
    }

    return NextResponse.json({ requestId: reqId, message: "WhatsApp OTP sent." });
  } catch (error) {
    console.error("YREL MSG91 OTP send error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Unable to send WhatsApp OTP right now. Please try again." }, { status: 500 });
  }
}
