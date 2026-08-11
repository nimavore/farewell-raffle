import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminAuthed } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Step 2 of go-live: enable spinning on the wheel.
export async function POST() {
  if (!isAdminAuthed()) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await getSupabaseAdmin().rpc("open_wheel");
  if (error) {
    return NextResponse.json(
      { ok: false, reason: "server_error", detail: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json(data);
}
