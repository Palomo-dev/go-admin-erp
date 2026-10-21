-- Rollback de 20261021080930_correo_dominio_tienda_encolar.sql
--
-- Borra la cola de trabajos: las filas no se recuperan.
-- No borra dominios ya creados en el proveedor ni filas de email_domains.
-- No quita last_check_at ni last_error (vienen de la migración anterior).

drop trigger if exists trg_retirar_correo_dominio on public.organization_domains;
drop trigger if exists trg_encolar_correo_dominio on public.organization_domains;

drop function if exists public.fn_reclamar_jobs_correo_tienda(integer, integer);
drop function if exists public.fn_reintentar_correo_tienda(integer, uuid);
drop function if exists public.fn_encolar_correo_dominio();
drop function if exists public.fn_correo_dominio_califica(public.organization_domains);

drop table if exists public.email_domain_jobs;

drop index if exists public.email_domains_un_predeterminado;
drop index if exists public.email_domains_organization_domain_id_key;

alter table public.email_domains
  drop constraint if exists email_domains_dns_provider_check,
  drop constraint if exists email_domains_organization_domain_id_fkey,
  drop column if exists demoted_at,
  drop column if exists check_attempts,
  drop column if exists dns_provider,
  drop column if exists organization_domain_id;
