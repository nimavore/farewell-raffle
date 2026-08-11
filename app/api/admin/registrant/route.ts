import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminAuthed } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Delete a registrant (mistaken entry / someone opting out). Only allowed while
// unlocked — after lock the pool is sized to the exact headcount, so removing a
// person would break the one-slot-per-person invariant.
export async function DELETE(req: Request) {
  if (!isAdminAuthed()) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  if (!id) {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: state } = await supabase
    .from("event_state")
    .select("registration_locked")
    .eq("id", 1)
    .single();
  if (state?.registration_locked) {
    return NextResponse.json(
      { ok: false, reason: "locked", message: "Unlock to edit registrants." },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("registrants").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
