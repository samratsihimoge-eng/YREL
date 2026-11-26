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
    let registered = false;
    const perPage = 1000;
    for (let page = 1; page <= 10; page++) {
      const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page, perPage });
      if (usersError) throw usersError;
      const match = users.users.find(user =>
        user.phone === phone && user.user_metadata?.account_type === accountType
      );
      if (match) { registered = true; break; }
      if (users.users.length < perPage) break;
    }
    return NextResponse.json({ registered });
  } catch (error) {
    console.error("YREL phone lookup error", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json({ error: "Could not check this number right now. Please try again." }, { status: 500 });
  }
}