import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { isAdminAuthed } from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Prize config may only change while registration is unlocked — once locked,
// the pool is finalized to the headcount.
async function ensureUnlocked() {
  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("event_state")
    .select("registration_locked")
    .eq("id", 1)
    .single();
  return !data?.registration_locked;
}

function unauthorized() {
  return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
}

function locked() {
  return NextResponse.json(
    { ok: false, reason: "locked", message: "Unlock registration to edit prizes." },
    { status: 409 }
  );
}

// Add a filler prize row.
export async function POST(req: Request) {
  if (!isAdminAuthed()) return unauthorized();
  if (!(await ensureUnlocked())) return locked();

  const body = await req.json().catch(() => ({}));
  const name = String(body?.name ?? "").trim();
  const quantity = Number(body?.quantity);

  if (!name || !Number.isInteger(quantity) || quantity < 0) {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: maxRow } = await supabase
    .from("prize_config")
    .select("sort")
    .order("sort", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sort = (maxRow?.sort ?? 0) + 1;

  const { error } = await supabase
    .from("prize_config")
    .insert({ name, quantity, is_shirt: false, sort });
  if (error) {
    return NextResponse.json({ ok: false, detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// Edit an existing prize row (name and/or quantity). Shirts: quantity is fixed
// at 6, so only filler rows are editable here.
export async function PATCH(req: Request) {
  if (!isAdminAuthed()) return unauthorized();
  if (!(await ensureUnlocked())) return locked();

  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });

  const patch: { name?: string; quantity?: number } = {};
  if (body?.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
    patch.name = name;
  }
  if (body?.quantity !== undefined) {
    const quantity = Number(body.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
    }
    patch.quantity = quantity;
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("prize_config")
    .update(patch)
    .eq("id", id)
    .eq("is_shirt", false); // never mutate the guaranteed shirt row
  if (error) {
    return NextResponse.json({ ok: false, detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// Remove a filler prize row.
export async function DELETE(req: Request) {
  if (!isAdminAuthed()) return unauthorized();
  if (!(await ensureUnlocked())) return locked();

  const body = await req.json().catch(() => ({}));
  const id = String(body?.id ?? "");
  if (!id) return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("prize_config")
    .delete()
    .eq("id", id)
    .eq("is_shirt", false); // the shirt row cannot be deleted
  if (error) {
    return NextResponse.json({ ok: false, detail: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
