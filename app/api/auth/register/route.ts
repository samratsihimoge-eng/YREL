import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const preferredRegion = "bom1";

export async function POST(request: NextRequest) {
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
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: "Password must contain at least 8 characters." }, { status: 400 });
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
      phone_confirm: false,
      ...(email ? { email, email_confirm: true } : {}),
      password,
      user_metadata: {
        full_name: fullName,
        account_type: accountType,
        phone,
        phone_verified: false
      }
    });

    if (error) {
      const message = /already|registered|unique/i.test(error.message)
        ? "This mobile number or email is already registered. Please log in."
        : "Could not create your account. Please try again.";
      return NextResponse.json({ error: message }, { status: 409 });
    }

    return NextResponse.json({
      userId: data.user.id,
      phone,
      accountType,
      verificationRequired: true,
      message: "Account created. Verify your mobile number to continue."
    }, { status: 201 });
  } catch (error) {
    console.error("YREL registration error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Unable to create account right now." }, { status: 500 });
  }
}
