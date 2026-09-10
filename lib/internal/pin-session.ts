import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const INTERNAL_PIN_COOKIE = "etos_internal_admin";
export const INTERNAL_PIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

function getSigningSecret() {
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Internal session signing secret is not configured.");
  return secret;
}

function hmac(value: string) {
  return createHmac("sha256", getSigningSecret()).update(value).digest("hex");
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function configuredSuperadminPin() {
  const pin = process.env.SUPERADMIN_PIN?.trim() ?? "";
  return /^\d{6}$/.test(pin) ? pin : null;
}

export function verifySuperadminPin(pin: string) {
  const configured = configuredSuperadminPin();
  return Boolean(configured && /^\d{6}$/.test(pin) && safeEqual(pin, configured));
}

export function signInternalPinSession(profileId: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + INTERNAL_PIN_SESSION_MAX_AGE_SECONDS;
  const payload = `${profileId}.${expiresAt}`;
  return `${payload}.${hmac(payload)}`;
}

export function readInternalPinSession(token: string | undefined) {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [profileId, expiresRaw, signature] = parts;
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) return null;
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return null;
  const payload = `${profileId}.${expiresRaw}`;
  const expected = hmac(payload);
  if (!safeEqual(signature, expected)) return null;
  return profileId;
}

export function internalPinClientHash(ip: string, userAgent: string) {
  return hmac(`internal-pin:${ip}:${userAgent}`);
}
