import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { SpinRpcResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public: the wheel calls this on spin release. Outcome is decided entirely by
// the server-side `spin` RPC (atomic draw) — the request body only names who
// is spinning.
export async function POST(req: Request) {
  let body: { registrantId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, reason: "bad_request" },
      { status: 400 }
    );
  }

  const registrantId = body?.registrantId;
  if (!registrantId || typeof registrantId !== "string") {
    return NextResponse.json(
      { ok: false, reason: "bad_request" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc("spin", {
    p_registrant: registrantId,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, reason: "server_error", detail: error.message },
      { status: 500 }
    );
  }

  const result = data as SpinRpcResult;
  return NextResponse.json(result, { status: result.ok ? 200 : 409 });
}
