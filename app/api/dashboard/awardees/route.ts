import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashLast4 } from "@/lib/assessment/security";
import { authorizeAssessmentManager } from "@/lib/internal/api-auth";

export const dynamic = "force-dynamic";
const MAX_RECORDS = 500;

type IncomingRecord = Record<string, unknown>;

function text(value: unknown, max = 180) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, max) : null;
}

function phoneLast4(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function buildAwardeeRow(record: IncomingRecord, index = 0, requireMajor = false) {
  const fullName = text(record.fullName ?? record.full_name ?? record.nama);
  const last4 = phoneLast4(record.whatsapp ?? record.phone ?? record.no_wa ?? record.last4);
  const major = text(record.major ?? record.jurusan ?? record.prodi);

  if (!fullName) throw new Error(`${index ? `Baris ${index}: ` : ""}nama awardee wajib diisi.`);
  if (!last4) throw new Error(`${index ? `Baris ${index}: ` : ""}nomor WhatsApp/HP harus memiliki minimal 4 digit.`);
  if (requireMajor && !major) throw new Error("Jurusan/Prodi wajib diisi.");

  return {
    external_id: text(record.externalId ?? record.external_id, 100),
    full_name: fullName,
    campus: text(record.campus ?? record.kampus),
    major,
    cohort: text(record.cohort ?? record.angkatan, 50),
    region: text(record.region ?? record.wilayah ?? record.cabang),
    status: "active",
    phone_last4: last4,
    phone_last4_hash: hashLast4(last4),
  };
}

function apiError(error: unknown, fallback: string) {
  const candidate = error as { code?: string; message?: string } | null;
  if (candidate?.code === "23505") return "ID Awardee sudah digunakan. Gunakan ID lain atau kosongkan field ID.";
  return error instanceof Error ? error.message : candidate?.message || fallback;
}

export async function POST(request: NextRequest) {
  const auth = await authorizeAssessmentManager();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json().catch(() => null);
    const admin = createAdminClient();

    if (body?.record && typeof body.record === "object") {
      const row = buildAwardeeRow(body.record as IncomingRecord, 0, true);
      const { data, error } = await admin
        .from("awardees")
        .insert(row)
        .select("id,external_id,full_name,campus,major,cohort,region,status,phone_last4")
        .single();
      if (error) throw error;

      await admin.from("audit_logs").insert({
        actor_id: auth.actorId,
        action: "awardee.create",
        resource_type: "awardee",
        resource_id: data.id,
        metadata: { source: "manual", major: data.major, region: data.region },
      });

      return NextResponse.json({ ok: true, awardee: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }

    const incoming: IncomingRecord[] = Array.isArray(body?.records) ? body.records.slice(0, MAX_RECORDS) : [];
    if (!incoming.length) return NextResponse.json({ error: "Tidak ada data awardee untuk diimpor." }, { status: 400 });

    const rows = incoming.map((record, index) => buildAwardeeRow(record, index + 1, false));
    const { error } = await admin.from("awardees").upsert(rows, { onConflict: "external_id" });
    if (error) throw error;

    await admin.from("audit_logs").insert({
      actor_id: auth.actorId,
      action: "awardee.import",
      resource_type: "awardee_batch",
      metadata: { count: rows.length, with_external_id: rows.filter((row) => row.external_id).length },
    });

    return NextResponse.json({ ok: true, count: rows.length }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("awardee create/import error", error);
    return NextResponse.json({ error: apiError(error, "Penyimpanan awardee gagal.") }, { status: 400 });
  }
}
