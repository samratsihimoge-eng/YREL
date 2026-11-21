
import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "standardwebhooks";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const hookSecret = process.env.SEND_SMS_HOOK_SECRET;
    const authKey = process.env.MSG91_AUTH_KEY;

    const templateId = "6b01545108a09f706d05f442";

    if (!hookSecret || !authKey) {
      return NextResponse.json(
        { error: "Server configuration missing" },
        { status: 500 }
      );
    }

    const payload = await request.text();

    const webhook = new Webhook(
      hookSecret.replace(/^v1,whsec_/, "")
    );

    const event = webhook.verify(
      payload,
      Object.fromEntries(request.headers.entries())
    ) as {
      user?: { phone?: string };
      sms?: { otp?: string };
    };

    const phone = event.user?.phone;
    const otp = event.sms?.otp;

    if (!phone || !otp) {
      return NextResponse.json(
        { error: "Phone number or OTP missing" },
        { status: 400 }
      );
    }

    const mobile = phone.replace(/\D/g, "");

    if (!/^91\d{10}$/.test(mobile)) {
      return NextResponse.json(
        { error: "Invalid Indian mobile number" },
        { status: 400 }
      );
    }

    if (!/^\d{4,9}$/.test(otp)) {
      return NextResponse.json(
        { error: "Invalid OTP format" },
        { status: 400 }
      );
    }

    const params = new URLSearchParams({
      template_id: templateId,
      mobile,
      otp,
      otp_expiry: "15"
    });

    const response = await fetch(
      `https://control.msg91.com/api/v5/otp?${params.toString()}`,
      {
        method: "POST",
        headers: {
          authkey: authKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          var1: "YREL "
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(4500)
      }
    );

    const result = await response.json();

    if (!response.ok || result.type !== "success") {
      console.error("MSG91 delivery failed:", result);

      return NextResponse.json(
        { error: "SMS delivery failed" },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Send SMS hook error:", error);

    return NextResponse.json(
      { error: "Unable to process SMS request" },
      { status: 500 }
    );
  }
}
