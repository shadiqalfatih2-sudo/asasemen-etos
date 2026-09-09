import { NextRequest, NextResponse } from "next/server";
import { authorizeAssessmentManager } from "@/lib/internal/api-auth";
import { createAdminClient } from "@/lib/supabase/admin";

function text(value: unknown, max = 200) {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized.slice(0, max) : null;
}

function nullableDate(value: unknown) {
  const normalized = text(value, 40);
  if (!normalized) return null;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function semesterValue(value: unknown) {
  const parsed = Number(value);
  return parsed === 1 || parsed === 2 ? parsed : null;
}

export async function POST(request: NextRequest) {
  const auth = await authorizeAssessmentManager();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json().catch(() => null);
    const name = text(body?.name, 160);
    const academicYear = text(body?.academicYear, 20);
    const semester = semesterValue(body?.semester);
    const startsAt = nullableDate(body?.startsAt);
    const endsAt = nullableDate(body?.endsAt);
    const activate = Boolean(body?.activate);

    if (!name || !academicYear || !semester) {
      return NextResponse.json({ error: "Nama periode, tahun ajaran, dan semester wajib diisi." }, { status: 400 });
    }
    if (startsAt === undefined || endsAt === undefined) {
      return NextResponse.json({ error: "Format tanggal periode tidak valid." }, { status: 400 });
    }
    if (startsAt && endsAt && new Date(startsAt) > new Date(endsAt)) {
      return NextResponse.json({ error: "Tanggal mulai harus sebelum tanggal selesai." }, { status: 400 });
    }

    const admin = createAdminClient();
    if (activate) {
      const { error: deactivateError } = await admin.from("assessment_periods").update({ is_active: false }).eq("is_active", true);
      if (deactivateError) throw deactivateError;
    }

    const { data, error } = await admin.from("assessment_periods").insert({
      name,
      academic_year: academicYear,
      semester,
      starts_at: startsAt,
      ends_at: endsAt,
      is_active: activate,
      created_by: auth.actorId,
    }).select("id").single();
    if (error) throw error;

    await admin.from("audit_logs").insert({
      actor_id: auth.actorId,
      action: "assessment_period.created",
      resource_type: "assessment_period",
      resource_id: data.id,
      metadata: { name, academic_year: academicYear, semester, is_active: activate },
    });

    return NextResponse.json({ ok: true, id: data.id }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("period create error", error);
    return NextResponse.json({ error: "Periode assessment belum dapat dibuat." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authorizeAssessmentManager();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json().catch(() => null);
    const id = text(body?.id, 80);
    const action = text(body?.action, 30);
    if (!id || !["activate", "deactivate", "update"].includes(action ?? "")) {
      return NextResponse.json({ error: "Perintah periode tidak valid." }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: existing, error: existingError } = await admin.from("assessment_periods").select("id,name,academic_year,semester,is_active").eq("id", id).maybeSingle();
    if (existingError || !existing) return NextResponse.json({ error: "Periode tidak ditemukan." }, { status: 404 });

    if (action === "activate") {
      const { error: deactivateError } = await admin.from("assessment_periods").update({ is_active: false }).eq("is_active", true);
      if (deactivateError) throw deactivateError;
      const { error } = await admin.from("assessment_periods").update({ is_active: true }).eq("id", id);
      if (error) throw error;
    } else if (action === "deactivate") {
      const { error } = await admin.from("assessment_periods").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    } else {
      const name = text(body?.name, 160);
      const academicYear = text(body?.academicYear, 20);
      const semester = semesterValue(body?.semester);
      const startsAt = nullableDate(body?.startsAt);
      const endsAt = nullableDate(body?.endsAt);
      if (!name || !academicYear || !semester || startsAt === undefined || endsAt === undefined) {
        return NextResponse.json({ error: "Data periode belum lengkap atau format tanggal salah." }, { status: 400 });
      }
      if (startsAt && endsAt && new Date(startsAt) > new Date(endsAt)) {
        return NextResponse.json({ error: "Tanggal mulai harus sebelum tanggal selesai." }, { status: 400 });
      }
      const { error } = await admin.from("assessment_periods").update({ name, academic_year: academicYear, semester, starts_at: startsAt, ends_at: endsAt }).eq("id", id);
      if (error) throw error;
    }

    await admin.from("audit_logs").insert({
      actor_id: auth.actorId,
      action: `assessment_period.${action}`,
      resource_type: "assessment_period",
      resource_id: id,
      metadata: { previous: existing },
    });

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("period update error", error);
    return NextResponse.json({ error: "Periode assessment belum dapat diperbarui." }, { status: 500 });
  }
}
