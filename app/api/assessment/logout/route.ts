import { NextResponse } from "next/server";
import { ASSESSMENT_SESSION_COOKIE } from "@/lib/assessment/security";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({ name: ASSESSMENT_SESSION_COOKIE, value: "", httpOnly: true, path: "/", maxAge: 0 });
  return response;
}
