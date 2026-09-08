export const SUPABASE_URL = "https://rizkxotjpibeiowayokr.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_Y-Vxq4GUE_uEa7PNkQZwkg_fD_DdbMO";

export function getAppUrl() {
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
