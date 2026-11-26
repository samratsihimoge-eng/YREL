import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const preferredRegion = "bom1";

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
      return NextResponse.json({ error: "This verification link is invalid." }, { status: 400 });
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Verification service is not configured." }, { status: 500 });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const { data: record, error: lookupError } = await admin
      .from("phone_verification_tokens")
      .select("id,user_id,phone,account_type,expires_at,used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    if (lookupError || !record || record.used_at || new Date(record.expires_at).getTime() <= Date.now()) {
      return NextResponse.json({ error: "This verification link has expired or was already used. Request a new link." }, { status: 410 });
    }

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(record.user_id);
    const user = userData?.user;
    if (userError || !user || user.phone !== record.phone || user.user_metadata?.account_type !== record.account_type) {
      return NextResponse.json({ error: "The account linked to this verification link could not be confirmed." }, { status: 400 });
    }

    const usedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await admin
      .from("phone_verification_tokens")
      .update({ used_at: usedAt })
      .eq("id", record.id)
      .is("used_at", null)
      .gt("expires_at", usedAt)
      .select("id")
      .maybeSingle();
    if (claimError || !claimed) {
      return NextResponse.json({ error: "This verification link has already been used. Request a new link." }, { status: 410 });
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(record.user_id, {
      phone_confirm: true,
      user_metadata: { ...user.user_metadata, phone_verified: true }
    });
    if (updateError) {
      await admin.from("phone_verification_tokens").update({ used_at: null }).eq("id", record.id);
      throw updateError;
    }

    return NextResponse.json({ verified: true, accountType: record.account_type, redirectTo: record.account_type === "partner" ? "/partner?verified=1" : "/?verified=1" });
  } catch (error) {
    console.error("YREL phone verification confirm error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Unable to verify this mobile number. Please request a new link." }, { status: 500 });
  }
}
