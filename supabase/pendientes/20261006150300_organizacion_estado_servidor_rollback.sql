-- Reversión de 20261006150300_organizacion_estado_servidor. Solo estructura (no cambia datos).
drop trigger if exists trg_organizations_proteger_estado on public.organizations;
drop function if exists public.fn_organizations_proteger_estado();
