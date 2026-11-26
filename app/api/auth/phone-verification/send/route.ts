import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const preferredRegion = "bom1";

export async function POST(request: NextRequest) {
  try {
    const { userId, phone, accountType } = await request.json();
    const normalized = String(phone || "").replace(/\D/g, "");
    const mobile = normalized.length === 12 && normalized.startsWith("91") ? normalized.slice(2) : normalized;
    if (typeof userId !== "string" || !["customer", "partner"].includes(accountType) || !/^[6-9]\d{9}$/.test(mobile)) {
      return NextResponse.json({ error: "Invalid verification request." }, { status: 400 });
    }

    const smsUrl = process.env.YREL_SMS_API_URL;
    const smsKey = process.env.YREL_SMS_API_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Verification service is not configured." }, { status: 500 });
    }
    if (!smsUrl || !smsKey) {
      return NextResponse.json({
        error: "SMS link service is not connected yet. Your account is saved; mobile verification will be available after the SMS provider is configured."
      }, { status: 503 });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const phoneE164 = `+91${mobile}`;
    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId);
    const user = userData?.user;
    if (userError || !user || user.phone !== phoneE164 || user.user_metadata?.account_type !== accountType || user.phone_confirmed_at) {
      return NextResponse.json({ error: "Account details could not be verified. Please sign in or register again." }, { status: 400 });
    }

    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count } = await admin.from("phone_verification_tokens").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
    if ((count || 0) >= 3) {
      return NextResponse.json({ error: "Please wait before requesting another verification link." }, { status: 429 });
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const { error: insertError } = await admin.from("phone_verification_tokens").insert({
      user_id: userId, phone: phoneE164, account_type: accountType,
      token_hash: tokenHash, expires_at: expiresAt
    });
    if (insertError) throw insertError;

    const link = new URL(`/verify-phone?token=${rawToken}`, request.url).toString();
    const smsResponse = await fetch(smsUrl, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${smsKey}` },
      body: JSON.stringify({
        to: phoneE164,
        message: `Verify your YREL mobile number by opening this secure link: ${link} This link expires in 30 minutes.`
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(12000)
    });
    if (!smsResponse.ok) {
      await admin.from("phone_verification_tokens").delete().eq("token_hash", tokenHash);
      console.error("YREL SMS gateway rejected verification link", { status: smsResponse.status });
      return NextResponse.json({ error: "The SMS provider could not send the verification link. Please try again later." }, { status: 502 });
    }

    return NextResponse.json({ sent: true, expiresInMinutes: 30 });
  } catch (error) {
    console.error("YREL verification link send error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Could not send the mobile verification link." }, { status: 500 });
  }
}
