import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const msg91AuthKey = process.env.MSG91_AUTH_KEY;

function normalizeIndianPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (/^[6-9]\d{9}$/.test(digits)) return "91" + digits;
  if (/^91[6-9]\d{9}$/.test(digits)) return digits;
  return "";
}

function phoneAliases(phone91: string) {
  const local = phone91.slice(2);
  return [phone91, "+" + phone91, local, "+91" + local];
}

export async function POST(request: NextRequest) {
  try {
    if (!supabaseUrl || !serviceKey || !msg91AuthKey) {
      return NextResponse.json({ error: "Authentication service is not configured." }, { status: 500 });
    }

    const body = await request.json();
    const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
    const requestedPhone = typeof body.phone === "string" ? normalizeIndianPhone(body.phone) : "";
    const accountType = body.accountType === "partner" ? "partner" : body.accountType === "customer" ? "customer" : "";

    if (!accessToken || accessToken.length < 20 || !requestedPhone || !accountType) {
      return NextResponse.json({ error: "Invalid verification request." }, { status: 400 });
    }

    const msgResponse = await fetch("https://api.msg91.com/api/v5/widget/verifyAccessToken", {
      method: "POST",
      headers: { authkey: msg91AuthKey, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ "access-token": accessToken }),
      cache: "no-store",
      signal: AbortSignal.timeout(10000)
    });

    const msgResult = await msgResponse.json().catch(() => ({}));
    if (!msgResponse.ok || msgResult?.type !== "success" || typeof msgResult?.message !== "string") {
      return NextResponse.json({ error: "WhatsApp OTP verification failed. Please request a new OTP." }, { status: 401 });
    }

    const verifiedPhone = normalizeIndianPhone(msgResult.message);
    if (!verifiedPhone || verifiedPhone !== requestedPhone) {
      return NextResponse.json({ error: "The verified mobile number does not match." }, { status: 403 });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const aliases = phoneAliases(verifiedPhone);
    let userId: string | null = null;

    if (accountType === "customer") {
      const { data, error } = await admin.from("customers").select("id").in("phone", aliases).limit(1).maybeSingle();
      if (error) throw error;
      userId = data?.id ?? null;
      if (userId) {
        const { error: updateError } = await admin.from("customers").update({ phone: "+" + verifiedPhone, phone_verified: true }).eq("id", userId);
        if (updateError) throw updateError;
      }
    } else {
      const { data, error } = await admin.from("driver_profiles").select("user_id").in("phone", aliases).limit(1).maybeSingle();
      if (error) throw error;
      userId = data?.user_id ?? null;
      if (userId) {
        const { error: updateError } = await admin.from("driver_profiles").update({ phone: "+" + verifiedPhone }).eq("user_id", userId);
        if (updateError) throw updateError;
      }
    }

    let email: string;
    if (userId) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data.user) {
        return NextResponse.json({ error: "Your existing YREL account needs admin review before OTP login." }, { status: 409 });
      }
      email = data.user.email || `${accountType}+${verifiedPhone}@auth.yrel.invalid`;
      if (!data.user.email) {
        // Preserve the existing Auth UUID (and all booking/profile foreign keys) for
        // legacy phone-auth accounts by adding a confirmed internal email alias.
        const { error: updateUserError } = await admin.auth.admin.updateUserById(userId, {
          email,
          email_confirm: true,
          user_metadata: {
            ...data.user.user_metadata,
            account_type: accountType === "partner" ? "yrel_partner" : "yrel_customer",
            phone: "+" + verifiedPhone,
            phone_verified: true
          }
        });
        if (updateUserError) throw updateUserError;
      }
    } else {
      email = `${accountType}+${verifiedPhone}@auth.yrel.invalid`;
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { account_type: accountType === "partner" ? "yrel_partner" : "yrel_customer", phone: "+" + verifiedPhone, phone_verified: true }
      });
      if (createError) {
        // A prior attempt may have created the deterministic account. Reuse it only after loading it from Auth.
        const { data: users, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        if (listError) throw createError;
        const existing = users.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
        if (!existing) throw createError;
        userId = existing.id;
      } else {
        userId = created.user.id;
      }
    }

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email
    });
    if (linkError || !linkData?.properties?.hashed_token) {
      throw linkError || new Error("Could not create a secure login session.");
    }

    return NextResponse.json({
      tokenHash: linkData.properties.hashed_token,
      phone: "+" + verifiedPhone,
      accountType
    });
  } catch (error) {
    console.error("MSG91 session exchange failed:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Unable to complete login right now. Please try again." }, { status: 500 });
  }
}
