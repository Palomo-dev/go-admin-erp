-- Reversión de 20261007140000_sitio_web_dominios.sql (PENDIENTE: no aplicada).
-- Quita la función del principal, los permisos (y sus asignaciones), los
-- disparadores, los índices y las columnas nuevas. Solo estructura: las
-- columnas que se quitan no existían antes; metadata conserva lo que había.

drop function if exists public.fn_sitio_web_dominio_principal(integer, uuid);

delete from public.role_permissions
 where permission_id in (select id from public.permissions where code in ('website.domains', 'website.domains.buy'));
delete from public.permissions where code in ('website.domains', 'website.domains.buy');

drop trigger if exists trg_domain_purchases_referencia on public.domain_purchases;
drop function if exists public.fn_domain_purchases_referencia();
drop index if exists public.idx_domain_purchases_reference;
drop index if exists public.idx_domain_purchases_domain_id;
alter table public.domain_purchases
  drop constraint if exists chk_domain_purchases_kind,
  drop constraint if exists chk_domain_purchases_years,
  drop constraint if exists chk_domain_purchases_refund_status,
  drop column if exists domain_id,
  drop column if exists years,
  drop column if exists kind,
  drop column if exists price_cost,
  drop column if exists price_charged,
  drop column if exists stripe_customer_id,
  drop column if exists expires_at,
  drop column if exists reference,
  drop column if exists refund_status,
  drop column if exists refunded_at;
drop sequence if exists public.domain_purchases_reference_seq;

drop trigger if exists trg_organization_domains_sede_org on public.organization_domains;
drop function if exists public.fn_organization_domains_sede_org();
drop index if exists public.idx_organization_domains_org_branch;
drop index if exists public.idx_organization_domains_vencimiento;
alter table public.organization_domains
  drop constraint if exists chk_organization_domains_ssl_status,
  drop constraint if exists chk_organization_domains_dns_config,
  drop column if exists ssl_status,
  drop column if exists dns_config,
  drop column if exists misconfigured,
  drop column if exists registrar,
  drop column if exists expires_at,
  drop column if exists auto_renew,
  drop column if exists renewal_price,
  drop column if exists renewal_currency,
  drop column if exists last_error,
  drop column if exists branch_id;
