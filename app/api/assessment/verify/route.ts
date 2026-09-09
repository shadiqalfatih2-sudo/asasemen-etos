import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ASSESSMENT_SESSION_COOKIE,
  ASSESSMENT_SESSION_MAX_AGE_SECONDS,
  hashLast4,
  normalizeLast4,
  requestClientHash,
  safeHashEqual,
  signAssessmentSession,
} from "@/lib/assessment/security";

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const awardeeId = typeof body?.awardeeId === "string" ? body.awardeeId : "";
    const last4 = normalizeLast4(body?.last4);
    if (!awardeeId || !last4) {
      return NextResponse.json({ error: "Pilih awardee dan masukkan tepat 4 digit terakhir WhatsApp." }, { status: 400 });
    }

    const admin = createAdminClient();
    const clientHash = requestClientHash(request);
    const since = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

    const { count } = await admin
      .from("audit_logs")
      .select("id", { count: "exact", head: true })
      .eq("action", "awardee.verify_failed")
      .eq("resource_id", awardeeId)
      .gte("created_at", since)
      .contains("metadata", { client_hash: clientHash });

    if ((count ?? 0) >= MAX_FAILED_ATTEMPTS) {
      return NextResponse.json({ error: "Terlalu banyak percobaan. Silakan coba lagi sekitar 15 menit lagi." }, { status: 429 });
    }

    const { data: awardee, error: awardeeError } = await admin
      .from("awardees")
      .select("id,full_name,phone_last4,phone_last4_hash,status")
      .eq("id", awardeeId)
      .eq("status", "active")
      .maybeSingle();

    if (awardeeError || !awardee) {
      return NextResponse.json({ error: "Data awardee tidak ditemukan." }, { status: 404 });
    }

    const suppliedHash = hashLast4(last4);
    const verified = awardee.phone_last4_hash
      ? safeHashEqual(suppliedHash, awardee.phone_last4_hash)
      : awardee.phone_last4 === last4;

    if (!verified) {
      await admin.from("audit_logs").insert({
        action: "awardee.verify_failed",
        resource_type: "awardee",
        resource_id: awardeeId,
        metadata: { client_hash: clientHash },
      });
      return NextResponse.json({ error: "4 digit terakhir WhatsApp tidak sesuai." }, { status: 401 });
    }

    if (!awardee.phone_last4_hash) {
      const { error: backfillError } = await admin
        .from("awardees")
        .update({ phone_last4_hash: suppliedHash, updated_at: new Date().toISOString() })
        .eq("id", awardee.id);
      if (backfillError) console.warn("awardee hash bootstrap failed", backfillError);
    }

    const { data: period, error: periodError } = await admin
      .from("assessment_periods")
      .select("id,name")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (periodError || !period) {
      return NextResponse.json({ error: "Belum ada periode assessment yang aktif." }, { status: 503 });
    }

    const verificationExpiresAt = new Date(Date.now() + ASSESSMENT_SESSION_MAX_AGE_SECONDS * 1000).toISOString();
    const now = new Date().toISOString();
    const { data: session, error: sessionError } = await admin
      .from("assessment_sessions")
      .upsert(
        {
          awardee_id: awardee.id,
          period_id: period.id,
          verification_expires_at: verificationExpiresAt,
          last_activity_at: now,
        },
        { onConflict: "awardee_id,period_id" },
      )
      .select("id,status")
      .single();

    if (sessionError || !session) throw sessionError || new Error("Session gagal dibuat.");

    await admin.from("audit_logs").insert({
      action: "awardee.verify_success",
      resource_type: "assessment_session",
      resource_id: session.id,
      metadata: { awardee_id: awardee.id, client_hash: clientHash },
    });

    const response = NextResponse.json({ ok: true, status: session.status, awardee: { id: awardee.id, fullName: awardee.full_name } });
    response.cookies.set({
      name: ASSESSMENT_SESSION_COOKIE,
      value: signAssessmentSession(session.id),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ASSESSMENT_SESSION_MAX_AGE_SECONDS,
    });
    return response;
  } catch (error) {
    console.error("assessment verification error", error);
    return NextResponse.json({ error: "Verifikasi belum dapat diproses. Silakan coba kembali." }, { status: 500 });
  }
}
