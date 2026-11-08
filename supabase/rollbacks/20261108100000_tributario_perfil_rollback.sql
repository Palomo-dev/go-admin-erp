-- Reversión de 20261108100000_tributario_perfil.sql (perfil tributario por vigencia).
-- Migración aplicada por el MCP el 2026-11-07 con orden del dueño.
-- Borra la función y las dos tablas: si ya hay perfiles guardados, respaldarlos antes.
-- organizations.fiscal_responsibilities NO se toca: conserva lo último que se guardó.
-- Sin estas tablas, «Perfil tributario» y «Centro tributario» vuelven a «pendiente de activar».

drop function if exists public.fn_perfil_tributario_guardar(integer, uuid, date, text, text[], boolean, boolean, text, jsonb, text);
drop table if exists public.organization_tax_profile_ica;
drop table if exists public.organization_tax_profiles;
