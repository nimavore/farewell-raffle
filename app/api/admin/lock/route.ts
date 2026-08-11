import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminAuthed } from "@/lib/adminAuth";
import type { LockResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!isAdminAuthed()) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const { data, error } = await getSupabaseAdmin().rpc("lock_registration");
  if (error) {
    return NextResponse.json(
      { ok: false, reason: "server_error", detail: error.message },
      { status: 500 }
    );
  }

  const result = data as LockResult;
  // ok:false here means a validation warning (too few / oversubscribed), which
  // is a 200 with an explanatory payload — not an HTTP error.
  return NextResponse.json(result);
}
