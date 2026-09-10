import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = createAdminClient();
    const [{ data: awardees, error: awardeeError }, { data: period, error: periodError }] = await Promise.all([
      admin.from("awardees").select("id,full_name,campus,major,cohort,region").eq("status", "active").order("full_name", { ascending: true }),
      admin.from("assessment_periods").select("id,name,academic_year,semester,starts_at,ends_at").eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (awardeeError) throw awardeeError;
    if (periodError) throw periodError;

    return NextResponse.json({ awardees: awardees ?? [], period: period ?? null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("assessment awardees error", error);
    return NextResponse.json({ error: "Data awardee belum dapat dimuat." }, { status: 500 });
  }
}
