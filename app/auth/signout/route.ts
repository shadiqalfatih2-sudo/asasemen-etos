import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { INTERNAL_PIN_COOKIE } from "@/lib/internal/pin-session";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) await supabase.auth.signOut();

  revalidatePath("/", "layout");
  const response = NextResponse.redirect(new URL("/dashboard/login", request.url), { status: 303 });
  response.cookies.set({
    name: INTERNAL_PIN_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
