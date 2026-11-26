import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const preferredRegion = "bom1";

const WIDGET_ID = "366b746f4e41323031343938";

export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();
    const mobile = String(phone || "").replace(/\D/g, "");
    const identifier = mobile.length === 10 ? "91" + mobile : mobile;
    if (!/^91[6-9]\d{9}$/.test(identifier)) {
      return NextResponse.json({ error: "Enter a valid 10-digit Indian mobile number." }, { status: 400 });
    }

    const widgetToken = process.env.MSG91_WIDGET_TOKEN;
    if (!widgetToken) {
      return NextResponse.json({ error: "WhatsApp OTP widget token is not configured on the server." }, { status: 500 });
    }

    const response = await fetch("https://api.msg91.com/api/v5/widget/sendOtp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ widgetId: WIDGET_ID, identifier, tokenAuth: widgetToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000)
    });
    const result = await response.json().catch(() => ({}));
    const reqId = result?.message || result?.reqId || result?.requestId;
    if (!response.ok || result?.type !== "success" || typeof reqId !== "string") {
      const providerMessage = typeof result?.message === "string" ? result.message.slice(0, 180) : "";
      console.error("MSG91 sendOtp failed", { status: response.status, type: result?.type, providerMessage });
      return NextResponse.json({ error: providerMessage || "MSG91 rejected the OTP request. Check the widget configuration." }, { status: 502 });
    }
    return NextResponse.json({ reqId });
  } catch (error) {
    console.error("WhatsApp OTP send error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Unable to send WhatsApp OTP." }, { status: 500 });
  }
}
