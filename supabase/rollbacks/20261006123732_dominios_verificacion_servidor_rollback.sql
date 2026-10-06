-- Reversión de 20261006150200_dominios_verificacion_servidor. Solo estructura (no cambia datos).
drop trigger if exists trg_organization_domains_proteger on public.organization_domains;
drop function if exists public.fn_organization_domains_proteger();
drop function if exists public.fn_dominio_en_otra_organizacion(text, integer);
