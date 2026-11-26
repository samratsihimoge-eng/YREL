import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const WIDGET_ID = "366b746f4e41323031343938";

export async function POST(request: NextRequest) {
  try {
    const { phone, reqId, otp, accountType } = await request.json();
    const mobile = String(phone || "").replace(/\D/g, "");
    const identifier = mobile.length === 10 ? "91" + mobile : mobile;
    if (!/^91[6-9]\d{9}$/.test(identifier) || typeof reqId !== "string" || !/^\d{6}$/.test(String(otp || ""))) {
      return NextResponse.json({ error: "Invalid phone number or 6-digit OTP." }, { status: 400 });
    }
    if (!["customer", "partner"].includes(accountType)) {
      return NextResponse.json({ error: "Invalid app account type." }, { status: 400 });
    }

    const authKey = process.env.MSG91_AUTH_KEY;
    const widgetToken = process.env.MSG91_WIDGET_TOKEN;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!authKey || !widgetToken || !supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Authentication service is not configured." }, { status: 500 });
    }

    const headers = { authkey: authKey, "content-type": "application/json", accept: "application/json" };
    const verifyResponse = await fetch("https://api.msg91.com/api/v5/widget/verifyOtp", {
      method: "POST", headers,
      body: JSON.stringify({ widgetId: WIDGET_ID, reqId, otp: String(otp), tokenAuth: widgetToken }),
      cache: "no-store", signal: AbortSignal.timeout(12000)
    });
    const verifyResult = await verifyResponse.json().catch(() => ({}));
    const accessToken = verifyResult?.message?.access_token || verifyResult?.message?.accessToken || verifyResult?.access_token || verifyResult?.accessToken;
    if (!verifyResponse.ok || verifyResult?.type !== "success" || typeof accessToken !== "string") {
      return NextResponse.json({ error: "OTP is incorrect or expired. Please try again." }, { status: 401 });
    }

    const tokenResponse = await fetch("https://api.msg91.com/api/v5/widget/verifyAccessToken", {
      method: "POST", headers,
      body: JSON.stringify({ "access-token": accessToken }),
      cache: "no-store", signal: AbortSignal.timeout(12000)
    });
    const tokenResult = await tokenResponse.json().catch(() => ({}));
    const verifiedIdentifier = String(tokenResult?.message || tokenResult?.identifier || "").replace(/\D/g, "");
    if (!tokenResponse.ok || tokenResult?.type !== "success" || verifiedIdentifier !== identifier) {
      return NextResponse.json({ error: "Phone verification could not be confirmed. Please try again." }, { status: 401 });
    }

    const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const email = `phone-${identifier}@login.yrel.invalid`;
    let userId: string | undefined;
    const { data: userPage, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw listError;
    const existing = userPage.users.find(user => user.email === email || user.phone === `+${identifier}`);
    if (existing) {
      userId = existing.id;
      const { error: updateError } = await admin.auth.admin.updateUserById(userId, {
        email, email_confirm: true, phone: `+${identifier}`, phone_confirm: true,
        user_metadata: { ...existing.user_metadata, phone: `+${identifier}`, last_login_app: accountType }
      });
      if (updateError) throw updateError;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email, email_confirm: true, phone: `+${identifier}`, phone_confirm: true,
        user_metadata: { phone: `+${identifier}`, account_type: accountType }
      });
      if (error) throw error;
      userId = data.user.id;
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (linkError) throw linkError;
    const tokenHash = linkData?.properties?.hashed_token;
    if (!tokenHash) throw new Error("Supabase did not return a one-time session token.");
    return NextResponse.json({ tokenHash, userId });
  } catch (error) {
    console.error("WhatsApp OTP verify error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Unable to complete secure login. Please try again." }, { status: 500 });
  }
}
