import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const digits = String((await request.json()).phone || "").replace(/\\D/g, "");
    const mobile = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
    if (!/^[6-9]\\d{9}$/.test(mobile)) {
      return NextResponse.json({ error: "Enter a valid 10-digit Indian mobile number." }, { status: 400 });
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: "Account service is not configured." }, { status: 500 });
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data, error } = await admin.rpc("yrel_lookup_auth_phone", { p_phone: `+91${mobile}` });
    if (error) {
      console.error("YREL phone lookup error", error.message);
      return NextResponse.json({ error: "Could not check this mobile number. Please try again." }, { status: 500 });
    }
    const user = Array.isArray(data) ? data[0] : null;
    if (!user) return NextResponse.json({ registered: false });
    if (user.account_type !== "customer") {
      return NextResponse.json({ error: "This mobile number is not registered as a YREL Customer account." }, { status: 409 });
    }
    return NextResponse.json({ registered: true, userId: user.user_id, phoneVerified: user.phone_confirmed });
  } catch {
    return NextResponse.json({ error: "Unable to check the mobile number right now." }, { status: 500 });
  }
}
