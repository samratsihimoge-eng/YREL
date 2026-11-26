import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const WIDGET_ID = "366b746f4e41323031343938";

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();
    const mobile = String(phone || "").replace(/\D/g, "");
    const identifier = mobile.length === 10 ? "91" + mobile : mobile;
    if (!/^91[6-9]\d{9}$/.test(identifier)) {
      return NextResponse.json({ error: "Enter a valid 10-digit Indian mobile number." }, { status: 400 });
    }

    const authKey = process.env.MSG91_AUTH_KEY;
    const widgetToken = process.env.MSG91_WIDGET_TOKEN;
    if (!authKey || !widgetToken) {
      return NextResponse.json({ error: "WhatsApp OTP is not configured on the server." }, { status: 500 });
    }

    const response = await fetch("https://api.msg91.com/api/v5/widget/sendOtp", {
      method: "POST",
      headers: { authkey: authKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ widgetId: WIDGET_ID, identifier, tokenAuth: widgetToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000)
    });
    const result = await response.json().catch(() => ({}));
    const reqId = result?.message || result?.reqId || result?.requestId;
    if (!response.ok || result?.type !== "success" || typeof reqId !== "string") {
      console.error("MSG91 sendOtp failed", { status: response.status, type: result?.type });
      return NextResponse.json({ error: "Could not send WhatsApp OTP. Please try again." }, { status: 502 });
    }
    return NextResponse.json({ reqId });
  } catch (error) {
    console.error("WhatsApp OTP send error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Unable to send WhatsApp OTP." }, { status: 500 });
  }
}
