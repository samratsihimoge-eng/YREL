import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

export const runtime = "nodejs";
export const preferredRegion = "bom1";

export async function POST(request: NextRequest) {
  let createdUserId: string | null = null;
  try {
    const body = await request.json();
    const fullName = String(body.fullName || "").trim();
    const email = String(body.email || "").trim().toLowerCase();
    const password = String(body.password || "");
    const accountType = body.accountType;
    const digits = String(body.phone || "").replace(/\D/g, "");
    const mobile = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;

    if (!["customer", "partner"].includes(accountType)) {
      return NextResponse.json({ error: "Invalid account type." }, { status: 400 });
    }
    if (fullName.length < 2 || fullName.length > 100) {
      return NextResponse.json({ error: "Enter your full name." }, { status: 400 });
    }
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      return NextResponse.json({ error: "Enter a valid 10-digit Indian mobile number." }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (!/^\d{4}$/.test(password)) {
      return NextResponse.json({ error: "Passcode must be exactly 4 digits." }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Account service is not configured." }, { status: 500 });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const phone = `+91${mobile}`;
    const { data, error } = await admin.auth.admin.createUser({
      phone,
      phone_confirm: true,
      email, email_confirm: true,
      password: createHmac("sha256", serviceKey).update(phone + ":" + password).digest("hex"),
      user_metadata: {
        full_name: fullName,
        account_type: accountType,
        phone,
        phone_verified: false, phone_verification_deferred: true
      }
    });

    if (error) {
      const message = /already|registered|unique/i.test(error.message)
        ? "This mobile number or email is already registered. Please log in."
        : "Could not create your account. Please try again.";
      return NextResponse.json({ error: message }, { status: 409 });
    }
    createdUserId = data.user.id;

    const { error: indexError } = await admin.from("account_phone_index").insert({
      user_id: data.user.id,
      phone,
      account_type: accountType
    });
    if (indexError) {
      await admin.auth.admin.deleteUser(data.user.id);
      createdUserId = null;
      if (indexError.code === "23505") {
        return NextResponse.json({ error: "This mobile number is already registered. Please log in." }, { status: 409 });
      }
      throw indexError;
    }

    return NextResponse.json({
      userId: data.user.id,
      phone,
      accountType,
      verificationRequired: false,
      message: "Account created. You can sign in with your passcode."
    }, { status: 201 });
  } catch (error) {
    console.error("YREL registration error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Unable to create account right now." }, { status: 500 });
  }
}
