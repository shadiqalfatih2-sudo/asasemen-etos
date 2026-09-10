import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeSuperadmin } from "@/lib/internal/api-auth";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLES = new Set(["superadmin", "coordinator", "facilitator"]);
const PERMISSIONS = ["assessment.view", "assessment.view_private", "assessment.export", "assessment.manage", "assessment.analytics"];

function cleanText(value: unknown, max = 160) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  return text ? text.slice(0, max) : "";
}

function normalizePermissions(role: string, values: unknown) {
  if (role === "superadmin") return [...PERMISSIONS];
  const incoming = Array.isArray(values) ? values.filter((item): item is string => typeof item === "string") : [];
  const allowed = incoming.filter((item) => PERMISSIONS.includes(item));
  if (!allowed.includes("assessment.view")) allowed.unshift("assessment.view");
  return [...new Set(allowed)];
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizeSuperadmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  try {
    const { id } = await context.params;
    if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "ID pengguna tidak valid." }, { status: 400 });
    const body = await request.json().catch(() => null);
    const fullName = cleanText(body?.fullName);
    const role = cleanText(body?.role, 30);
    const region = cleanText(body?.region, 100) || null;
    const isActive = typeof body?.isActive === "boolean" ? body.isActive : true;
    const password = String(body?.password ?? "");
    const permissions = normalizePermissions(role, body?.permissions);

    if (!fullName) return NextResponse.json({ error: "Nama lengkap wajib diisi." }, { status: 400 });
    if (!ROLES.has(role)) return NextResponse.json({ error: "Role pengguna tidak valid." }, { status: 400 });
    if (password && password.length < 8) return NextResponse.json({ error: "Password baru minimal 8 karakter." }, { status: 400 });
    if (id === auth.actorId && (!isActive || role !== "superadmin")) return NextResponse.json({ error: "Akun Superadmin yang sedang digunakan tidak dapat dinonaktifkan atau diturunkan rolenya." }, { status: 400 });

    const admin = createAdminClient();
    const { data: existing, error: existingError } = await admin.from("profiles").select("id,role,is_active").eq("id", id).maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return NextResponse.json({ error: "Profil pengguna tidak ditemukan." }, { status: 404 });

    if (password || fullName) {
      const attributes: { password?: string; user_metadata?: Record<string, string> } = { user_metadata: { full_name: fullName } };
      if (password) attributes.password = password;
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(id, attributes);
      if (authUpdateError) throw authUpdateError;
    }

    const { error: profileError } = await admin.from("profiles").update({
      full_name: fullName,
      role,
      permissions,
      region,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    if (profileError) throw profileError;

    if (Array.isArray(body?.awardeeIds)) {
      const awardeeIds = [...new Set(body.awardeeIds.filter((value: unknown): value is string => typeof value === "string" && UUID_PATTERN.test(value)))].slice(0, 1000);
      if (awardeeIds.length) {
        const { data: validAwardees, error: awardeeError } = await admin.from("awardees").select("id").in("id", awardeeIds).eq("status", "active");
        if (awardeeError) throw awardeeError;
        if ((validAwardees?.length ?? 0) !== awardeeIds.length) return NextResponse.json({ error: "Terdapat assignment awardee yang tidak valid." }, { status: 400 });
      }
      const { error: clearError } = await admin.from("facilitator_assignments").delete().eq("facilitator_id", id);
      if (clearError) throw clearError;
      if (awardeeIds.length) {
        const { error: assignmentError } = await admin.from("facilitator_assignments").insert(awardeeIds.map((awardeeId) => ({ facilitator_id: id, awardee_id: awardeeId })));
        if (assignmentError) throw assignmentError;
      }
    }

    await admin.from("audit_logs").insert({
      actor_id: auth.actorId,
      action: "internal_user.update",
      resource_type: "profile",
      resource_id: id,
      metadata: { role, region, permissions, is_active: isActive, password_reset: Boolean(password), assignments_updated: Array.isArray(body?.awardeeIds) },
    });

    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("internal user update error", error);
    return NextResponse.json({ error: "Perubahan pengguna belum dapat disimpan." }, { status: 400 });
  }
}
