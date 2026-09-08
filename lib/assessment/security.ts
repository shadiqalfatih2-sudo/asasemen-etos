import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const ASSESSMENT_SESSION_COOKIE = "etos_assessment_session";
export const ASSESSMENT_SESSION_MAX_AGE_SECONDS = 60 * 60 * 2;

function getSecuritySecret() {
  const secret = process.env.ASSESSMENT_SESSION_SECRET || process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Assessment security secret is not configured.");
  return secret;
}

function hmac(value: string) {
  return createHmac("sha256", getSecuritySecret()).update(value).digest("hex");
}

export function normalizeLast4(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!/^\d{4}$/.test(digits)) return null;
  return digits;
}

export function hashLast4(last4: string) {
  return hmac(`awardee:last4:${last4}`);
}

export function safeHashEqual(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function signAssessmentSession(sessionId: string) {
  const signature = hmac(`assessment-session:${sessionId}`);
  return `${sessionId}.${signature}`;
}

export function readAssessmentSessionToken(token: string | undefined) {
  if (!token) return null;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return null;
  const sessionId = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = hmac(`assessment-session:${sessionId}`);
  if (!safeHashEqual(signature, expected)) return null;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return null;
  return sessionId;
}

export function requestClientHash(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";
  return hmac(`client:${forwarded}:${userAgent}`);
}
