import "server-only";

import { createHash } from "crypto";
import { cookies } from "next/headers";

export const ADMIN_COOKIE = "raffle_admin";

function adminPassword(): string {
  const pw = process.env.ADMIN_PASSWORD;
  if (!pw) throw new Error("Missing ADMIN_PASSWORD env var.");
  return pw;
}

// The cookie stores a hash of the password, not the password itself.
export function adminToken(): string {
  return createHash("sha256")
    .update(`farewell-raffle:${adminPassword()}`)
    .digest("hex");
}

export function passwordMatches(candidate: string): boolean {
  return typeof candidate === "string" && candidate === adminPassword();
}

// True when the request carries a valid admin cookie. Used to gate the
// privileged API routes.
export function isAdminAuthed(): boolean {
  const jar = cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  return !!token && token === adminToken();
}
