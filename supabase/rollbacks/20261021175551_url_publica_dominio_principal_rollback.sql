-- Rollback de 20261021175551_url_publica_dominio_principal.sql
--
-- Quita la función, el trigger y el espejo automático.
-- No restaura organizations.custom_domain: el backfill escribió el
-- principal verificado y vació valores que no tenían esa fila. Esos
-- valores anteriores no se versionan.

set lock_timeout = '10s';

drop trigger if exists trg_organization_domains_sync_custom_domain on public.organization_domains;
drop function if exists public.fn_sync_custom_domain_org();
drop function if exists public.fn_url_publica_org(integer);

reset lock_timeout;
