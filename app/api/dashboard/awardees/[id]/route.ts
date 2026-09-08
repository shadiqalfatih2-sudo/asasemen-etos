import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashLast4 } from "@/lib/assessment/security";
import { authorizeAssessmentManager } from "@/lib/internal/api-auth";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };
type IncomingRecord = Record<string, unknown>;

function text(value: unknown, max = 180) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, max) : null;
}

function phoneLast4(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function apiError(error: unknown, fallback: string) {
  const candidate = error as { code?: string; message?: string } | null;
  if (candidate?.code === "23505") return "ID Awardee sudah digunakan. Gunakan ID lain atau kosongkan field ID.";
  return error instanceof Error ? error.message : candidate?.message || fallback;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await authorizeAssessmentManager();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await context.params;
    if (!validUuid(id)) return NextResponse.json({ error: "ID awardee tidak valid." }, { status: 400 });

    const body = await request.json().catch(() => null);
    const record = (body?.record ?? body) as IncomingRecord | null;
    if (!record || typeof record !== "object") return NextResponse.json({ error: "Data awardee tidak valid." }, { status: 400 });

    const fullName = text(record.fullName ?? record.full_name ?? record.nama);
    const major = text(record.major ?? record.jurusan ?? record.prodi);
    if (!fullName) return NextResponse.json({ error: "Nama awardee wajib diisi." }, { status: 400 });
    if (!major) return NextResponse.json({ error: "Jurusan/Prodi wajib diisi." }, { status: 400 });

    const update: Record<string, unknown> = {
      external_id: text(record.externalId ?? record.external_id, 100),
      full_name: fullName,
      campus: text(record.campus ?? record.kampus),
      major,
      cohort: text(record.cohort ?? record.angkatan, 50),
      region: text(record.region ?? record.wilayah ?? record.cabang),
    };

    const rawPhone = record.whatsapp ?? record.phone ?? record.no_wa;
    if (String(rawPhone ?? "").trim()) {
      const last4 = phoneLast4(rawPhone);
      if (!last4) return NextResponse.json({ error: "Nomor WhatsApp/HP baru harus memiliki minimal 4 digit." }, { status: 400 });
      update.phone_last4 = last4;
      update.phone_last4_hash = hashLast4(last4);
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("awardees")
      .update(update)
      .eq("id", id)
      .eq("status", "active")
      .select("id,external_id,full_name,campus,major,cohort,region,status,phone_last4")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Awardee aktif tidak ditemukan." }, { status: 404 });

    await admin.from("audit_logs").insert({
      actor_id: auth.actorId,
      action: "awardee.update",
      resource_type: "awardee",
      resource_id: id,
      metadata: { phone_changed: Boolean(String(rawPhone ?? "").trim()), major: data.major, region: data.region },
    });

    return NextResponse.json({ ok: true, awardee: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("awardee update error", error);
    return NextResponse.json({ error: apiError(error, "Perubahan awardee gagal disimpan.") }, { status: 400 });
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const auth = await authorizeAssessmentManager();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await context.params;
    if (!validUuid(id)) return NextResponse.json({ error: "ID awardee tidak valid." }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("awardees")
      .update({ status: "inactive" })
      .eq("id", id)
      .eq("status", "active")
      .select("id,full_name")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Awardee aktif tidak ditemukan." }, { status: 404 });

    await admin.from("audit_logs").insert({
      actor_id: auth.actorId,
      action: "awardee.deactivate",
      resource_type: "awardee",
      resource_id: id,
      metadata: { full_name: data.full_name },
    });

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("awardee deactivate error", error);
    return NextResponse.json({ error: "Awardee belum dapat dinonaktifkan." }, { status: 500 });
  }
}
