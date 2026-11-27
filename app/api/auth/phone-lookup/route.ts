import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const preferredRegion = "bom1";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const digits = String(body.phone || "").replace(/\D/g, "");
    const accountType = String(body.accountType || "");
    if (!/^[6-9]\d{9}$/.test(digits) || !["customer", "partner"].includes(accountType)) {
      return NextResponse.json({ error: "Enter a valid mobile number." }, { status: 400 });
    }
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return NextResponse.json({ error: "Account service is not configured." }, { status: 500 });

    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const phone = "+91" + digits;
    // Indexed lookup avoids paging through the entire Supabase Auth user directory on every login.
    const { data, error } = await admin
      .from("account_phone_index")
      .select("user_id")
      .eq("phone", phone)
      .eq("account_type", accountType)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({ registered: Boolean(data?.user_id) });
  } catch (error) {
    console.error("YREL phone lookup error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Could not check this number right now. Please try again." }, { status: 500 });
  }
}
