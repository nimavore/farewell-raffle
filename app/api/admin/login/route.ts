import { NextResponse } from "next/server";
import {
  ADMIN_COOKIE,
  adminToken,
  isAdminAuthed,
  passwordMatches,
} from "@/lib/adminAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { password?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!passwordMatches(body?.password ?? "")) {
    return NextResponse.json(
      { ok: false, reason: "bad_password" },
      { status: 401 }
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, adminToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // a week — covers the registration window
  });
  return res;
}

// Lets the monitor page check on load whether it already holds a valid session.
export async function GET() {
  return NextResponse.json({ ok: isAdminAuthed() });
}
