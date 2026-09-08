-- ETOS Assessment Center — manual awardee management
-- Store only the last four digits needed for internal verification display.
-- The full phone/WhatsApp number is intentionally not persisted.

alter table public.awardees
  add column if not exists phone_last4 text
  check (phone_last4 is null or phone_last4 ~ '^[0-9]{4}$');

comment on column public.awardees.phone_last4 is
  'Last four digits of awardee WhatsApp/phone for masked internal display. Full phone number is not stored.';
