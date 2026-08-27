-- ============================================================
-- F10 — Columna reviews_auto_approve en website_settings
-- ============================================================
-- Permite que cada organización decida si las reseñas de
-- productos se auto-aprueban (true) o requieren moderación
-- manual (false/default). La lee /api/reviews en el sitio.
-- Idempotente con if not exists.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'website_settings'
      and column_name = 'reviews_auto_approve'
  ) then
    alter table public.website_settings
      add column reviews_auto_approve boolean not null default false;
  end if;
end $$;

comment on column public.website_settings.reviews_auto_approve is
  'F10: si true, las reseñas de productos se insertan como approved (sin moderación). Default false.';
