-- ============================================================
-- Analítica web — geolocalización aproximada de visitas (Figma 03 › 464:237482).
--
-- Aditiva: dos columnas NULL-ables y un índice. `country` ya existía (vacía en
-- todas las filas: el registro de la visita escribía `country: null` a mano).
--
-- Privacidad (decisión aprobada):
--   - Solo ciudad, región y país, resueltos en el borde por las cabeceras de
--     Vercel (`x-vercel-ip-city`, `x-vercel-ip-country-region`,
--     `x-vercel-ip-country`). Sin servicio externo.
--   - NUNCA la IP en claro ni coordenadas: no se añaden `latitude`/`longitude`.
--     `ip_hash` (SHA-256 truncado, ya existente) se conserva tal cual.
--   - Solo afecta a visitas nuevas: las anteriores no se pueden recuperar.
--
-- El índice (organization_id, ip_hash, created_at) sirve a `fn_analitica_web`
-- para decidir si un visitante es nuevo (¿tiene visitas antes del periodo?).
-- ============================================================

alter table public.website_visits
  add column if not exists city text,
  add column if not exists region text;

comment on column public.website_visits.country is
  'País de la visita (ISO 3166-1 alfa-2), resuelto en el borde por la cabecera x-vercel-ip-country. NULL si no se pudo resolver. Nunca se guarda la IP.';
comment on column public.website_visits.region is
  'Región o departamento (código ISO 3166-2 sin el país, p. ej. DC), cabecera x-vercel-ip-country-region. Aproximado. NULL si no se pudo resolver.';
comment on column public.website_visits.city is
  'Ciudad aproximada, cabecera x-vercel-ip-city (decodificada). Sin coordenadas ni IP. NULL si no se pudo resolver.';

create index if not exists idx_website_visits_org_iphash_created
  on public.website_visits (organization_id, ip_hash, created_at);
