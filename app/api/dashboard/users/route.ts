import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeSuperadmin } from "@/lib/internal/api-auth";

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

export async function POST(request: NextRequest) {
  const auth = await authorizeSuperadmin();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let createdUserId: string | null = null;
  try {
    const body = await request.json().catch(() => null);
    const fullName = cleanText(body?.fullName);
    const email = cleanText(body?.email, 200).toLowerCase();
    const password = String(body?.password ?? "");
    const role = cleanText(body?.role, 30) || "facilitator";
    const region = cleanText(body?.region, 100) || null;

    if (!fullName) return NextResponse.json({ error: "Nama lengkap wajib diisi." }, { status: 400 });
    if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: "Email internal tidak valid." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password sementara minimal 8 karakter." }, { status: 400 });
    if (!ROLES.has(role)) return NextResponse.json({ error: "Role pengguna tidak valid." }, { status: 400 });

    const admin = createAdminClient();
    const { data: created, error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
    if (createError || !created.user) throw createError || new Error("Akun Auth gagal dibuat.");
    createdUserId = created.user.id;

    const permissions = normalizePermissions(role, body?.permissions);
    const { error: profileError } = await admin.from("profiles").update({ full_name: fullName, role, permissions, region, is_active: true }).eq("id", created.user.id);
    if (profileError) throw profileError;

    await admin.from("audit_logs").insert({ actor_id: auth.actorId, action: "internal_user.create", resource_type: "profile", resource_id: created.user.id, metadata: { email, role, region, permissions } });

    return NextResponse.json({ ok: true, user: { id: created.user.id, email, fullName, role, permissions, region, isActive: true } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (createdUserId) {
      try { await createAdminClient().auth.admin.deleteUser(createdUserId); } catch { /* rollback best effort */ }
    }
    const message = error instanceof Error ? error.message : "Akun internal belum dapat dibuat.";
    const friendly = /already|registered|exists/i.test(message) ? "Email tersebut sudah terdaftar." : "Akun internal belum dapat dibuat.";
    console.error("internal user create error", error);
    return NextResponse.json({ error: friendly }, { status: 400 });
  }
}
