import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const preferredRegion = "bom1";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const requestId = String(body.requestId || "");
    if (!requestId) return NextResponse.json({ error: "Request a WhatsApp OTP first." }, { status: 400 });
    const authkey = process.env.MSG91_AUTH_KEY;
    const widgetId = process.env.MSG91_WIDGET_ID;
    if (!authkey || !widgetId) return NextResponse.json({ error: "MSG91 OTP Widget is not configured in Vercel." }, { status: 503 });
    const upstream = await fetch("https://api.msg91.com/api/v5/widget/retryOtp", {
      method: "POST", headers: { "Content-Type": "application/json", authkey },
      body: JSON.stringify({ widgetId, reqId: requestId, retryChannel: "11" }), cache: "no-store"
    });
    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok || result.type !== "success") {
      return NextResponse.json({ error: result?.message || "Could not send SMS OTP. Check that SMS retry is enabled in your MSG91 Widget." }, { status: 502 });
    }
    return NextResponse.json({ requestId: result.message || requestId, message: "SMS OTP sent." });
  } catch (error) {
    console.error("YREL MSG91 SMS retry error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Unable to send SMS OTP right now." }, { status: 500 });
  }
}
