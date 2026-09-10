import "server-only";

import { getInternalUser } from "@/lib/internal/auth";

type ApiProfile = {
  id: string;
  role: "superadmin" | "coordinator" | "facilitator";
  permissions: string[];
  is_active: boolean;
};

async function getApiActor() {
  const auth = await getInternalUser();
  if (!auth) return { ok: false as const, status: 401, error: "Login diperlukan." };

  const profile = auth.profile as ApiProfile;
  if (!profile.is_active) return { ok: false as const, status: 403, error: "Akun internal tidak aktif." };

  return { ok: true as const, actorId: profile.id, supabase: auth.supabase, profile };
}

export async function authorizeAssessmentManager() {
  const auth = await getApiActor();
  if (!auth.ok) return auth;
  const allowed = auth.profile.role === "superadmin" || auth.profile.role === "coordinator" || auth.profile.permissions.includes("assessment.manage");
  if (!allowed) return { ok: false as const, status: 403, error: "Akun tidak memiliki izin mengelola assessment." };
  return auth;
}

export async function authorizeAssessmentExporter() {
  const auth = await getApiActor();
  if (!auth.ok) return auth;
  const allowed = auth.profile.role === "superadmin" || auth.profile.permissions.includes("assessment.export");
  if (!allowed) return { ok: false as const, status: 403, error: "Akun tidak memiliki izin mengekspor laporan assessment." };
  return { ...auth, mayViewPrivate: auth.profile.role === "superadmin" || auth.profile.permissions.includes("assessment.view_private") };
}

export async function authorizeSuperadmin() {
  const auth = await getApiActor();
  if (!auth.ok) return auth;
  if (auth.profile.role !== "superadmin") return { ok: false as const, status: 403, error: "Hanya Superadmin yang dapat mengelola pengguna internal." };
  return auth;
}
