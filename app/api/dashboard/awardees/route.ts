import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashLast4 } from "@/lib/assessment/security";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const MAX_RECORDS = 500;

type IncomingRecord = Record<string, unknown>;

function text(value: unknown, max = 180) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, max) : null;
}

function verificationLast4(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

async function authorizeManage() {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  const subject = typeof claimsData?.claims?.sub === "string" ? claimsData.claims.sub : null;
  if (error || !subject) return { ok: false as const, status: 401, error: "Login diperlukan." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id,role,permissions,is_active")
    .eq("id", subject)
    .maybeSingle();

  const allowed = profile?.is_active && (
    profile.role === "superadmin" ||
    profile.role === "coordinator" ||
    (Array.isArray(profile.permissions) && profile.permissions.includes("assessment.manage"))
  );

  if (!allowed) return { ok: false as const, status: 403, error: "Akun tidak memiliki izin mengelola awardee." };
  return { ok: true as const, actorId: subject };
}

export async function POST(request: NextRequest) {
  const auth = await authorizeManage();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const body = await request.json().catch(() => null);
    const incoming: IncomingRecord[] = Array.isArray(body?.records) ? body.records.slice(0, MAX_RECORDS) : [];
    if (!incoming.length) return NextResponse.json({ error: "Tidak ada data awardee untuk diimpor." }, { status: 400 });

    const rows = incoming.map((record, index) => {
      const fullName = text(record.fullName ?? record.full_name ?? record.nama);
      const last4 = verificationLast4(record.whatsapp ?? record.phone ?? record.no_wa ?? record.last4);
      if (!fullName) throw new Error(`Baris ${index + 1}: nama awardee kosong.`);
      if (!last4) throw new Error(`Baris ${index + 1}: nomor WhatsApp harus memiliki minimal 4 digit.`);

      return {
        external_id: text(record.externalId ?? record.external_id, 100),
        full_name: fullName,
        campus: text(record.campus ?? record.kampus),
        major: text(record.major ?? record.jurusan ?? record.prodi),
        cohort: text(record.cohort ?? record.angkatan, 50),
        region: text(record.region ?? record.wilayah ?? record.cabang),
        status: "active",
        phone_last4_hash: hashLast4(last4),
      };
    });

    const admin = createAdminClient();
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
    console.error("awardee import error", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import awardee gagal." }, { status: 400 });
  }
}
