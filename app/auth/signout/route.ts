import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) await supabase.auth.signOut();
  revalidatePath("/", "layout");
  return NextResponse.redirect(new URL("/dashboard/login", request.url), { status: 303 });
}
