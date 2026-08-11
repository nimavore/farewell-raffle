import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminAuthed } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!isAdminAuthed()) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  // Require an explicit typed confirmation to avoid accidental wipes.
  let body: { confirm?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (body?.confirm !== "RESET") {
    return NextResponse.json(
      { ok: false, reason: "confirm_required" },
      { status: 400 }
    );
  }

  const { data, error } = await getSupabaseAdmin().rpc("reset_event");
  if (error) {
    return NextResponse.json(
      { ok: false, reason: "server_error", detail: error.message },
      { status: 500 }
    );
  }
  return NextResponse.json(data);
}
