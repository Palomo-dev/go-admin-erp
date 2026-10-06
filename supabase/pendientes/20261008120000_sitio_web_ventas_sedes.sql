-- SIN APLICAR (2026-10-08). Área «ventas» del módulo Sitio web: Ventas en
-- línea (Figma B/10) y Sedes en la web (B/11). Reversión:
-- 20261008120000_sitio_web_ventas_sedes_rollback.sql.
--
-- Todo es ADITIVO: columnas nuevas con DEFAULT o NULL-ables, un índice, una
-- FK opcional y una función. Nada se borra ni cambia de tipo.
--
-- 1. website_settings.checkout_guest_enabled  boolean NOT NULL DEFAULT true
--    «Compra como invitado» (B/10-01). DEFAULT true = lo que hace hoy el sitio
--    (nunca exige cuenta): aplicar la migración no cambia ningún checkout.
-- 2. website_settings.checkout_min_order_amount numeric(14,2) NULL, >= 0
--    «Pedido mínimo». NULL = sin mínimo (lo de hoy). El sitio público
--    (goadmin-websites) debe hacerlo cumplir en el servidor al crear el pedido:
--    PR aparte en ese repo, después de aplicar esto.
-- 3. website_settings.multi_outlet_mode text NOT NULL DEFAULT 'selector'
--    «Un sitio con selector de sede» | «Un sitio por sede» (B/11-05).
-- 4. organization_domains.branch_id integer NULL -> branches(id) ON DELETE SET NULL
--    Dominio propio por sede (B/11-05). Lo propone también el área dominios:
--    `add column if not exists` para que no choquen si se aplica la de ellos.
-- 5. fn_sitio_web_guardar_sedes(p_org, p_modo, p_sedes): guarda Sedes en la
--    web en UNA transacción (CLAUDE.md: varias tablas -> RPC). SECURITY DEFINER
--    con el mismo criterio de permiso que la RLS del módulo
--    (fn_website_tiene_permiso 'website.sites.edit'); libera primero los slugs
--    que cambian para no chocar con el índice único a mitad del lote. Hasta
--    que se aplique, el servidor hace N updates (sedesWeb.server.ts).
--
-- Medido por MCP (SELECT, 2026-10-08): 92 filas en website_settings, todas con
-- branch_id NULL; branches.is_web_published = false y slug NULL en todas.
--
-- ENSAYO (2026-10-08, execute_sql): un bloque `do` aplicó todo lo de abajo en
-- la org 142 (3 sedes activas), con la sesión simulada del dueño
-- (`request.jwt.claims`), y terminó en `raise exception`, así que se deshizo:
--   ENSAYO_OK guardadas=2 publicadas=2 modo=per_branch check_minimo=t
--   sin_sesion=t ajena=t slug_unico=t intercambio_ok=norte,centro
-- Comprobó: los DEFAULT no cambian ningún checkout (0 filas con invitado
-- distinto de true o modo distinto de 'selector'); el CHECK rechaza un mínimo
-- negativo; sin sesión la función responde 42501; una sede de otra
-- organización es P0002; dos sedes con la misma dirección chocan con el
-- índice único; intercambiar direcciones en el mismo lote funciona.

alter table public.website_settings
  add column if not exists checkout_guest_enabled boolean not null default true;

alter table public.website_settings
  add column if not exists checkout_min_order_amount numeric(14,2);

alter table public.website_settings
  drop constraint if exists website_settings_checkout_min_order_amount_check;
alter table public.website_settings
  add constraint website_settings_checkout_min_order_amount_check
  check (checkout_min_order_amount is null or checkout_min_order_amount >= 0);

alter table public.website_settings
  add column if not exists multi_outlet_mode text not null default 'selector';

alter table public.website_settings
  drop constraint if exists website_settings_multi_outlet_mode_check;
alter table public.website_settings
  add constraint website_settings_multi_outlet_mode_check
  check (multi_outlet_mode in ('selector', 'per_branch'));

comment on column public.website_settings.checkout_guest_enabled is
  'Checkout del sitio: el cliente compra sin crear cuenta. Se edita en Sitio web › Ventas en línea.';
comment on column public.website_settings.checkout_min_order_amount is
  'Pedido mínimo del sitio en la moneda base. NULL = sin mínimo. El sitio lo valida en el servidor.';
comment on column public.website_settings.multi_outlet_mode is
  'Sedes en la web: selector (un sitio, el cliente elige la sede) o per_branch (un sitio por sede).';

alter table public.organization_domains
  add column if not exists branch_id integer references public.branches(id) on delete set null;

create index if not exists idx_organization_domains_org_branch
  on public.organization_domains (organization_id, branch_id)
  where branch_id is not null;

comment on column public.organization_domains.branch_id is
  'Sede a la que apunta el dominio (dominio propio por sede). NULL = sitio principal.';

create or replace function public.fn_sitio_web_guardar_sedes(
  p_org integer,
  p_modo text,
  p_sedes jsonb
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_n integer := 0;
  v_s jsonb;
begin
  if not public.fn_website_tiene_permiso(p_org, 'website.sites.edit') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_modo is not null and p_modo not in ('selector', 'per_branch') then
    raise exception 'modo_invalido' using errcode = '22023';
  end if;
  if jsonb_typeof(p_sedes) <> 'array' then
    raise exception 'sedes_invalidas' using errcode = '22023';
  end if;
  -- Todas las sedes del lote deben ser de la organización.
  if exists (
    select 1 from jsonb_array_elements(p_sedes) e
    where not exists (select 1 from public.branches b where b.id = (e->>'id')::integer and b.organization_id = p_org)
  ) then
    raise exception 'sede_no_encontrada' using errcode = 'P0002';
  end if;
  -- Una sede inactiva no se publica.
  if exists (
    select 1 from jsonb_array_elements(p_sedes) e
    join public.branches b on b.id = (e->>'id')::integer
    where (e->>'publicada')::boolean and b.is_active is false
  ) then
    raise exception 'sede_inactiva' using errcode = '22023';
  end if;

  if p_modo is not null then
    update public.website_settings
       set multi_outlet_mode = p_modo, updated_at = now()
     where organization_id = p_org and branch_id is null;
  end if;

  -- Primero se liberan los slugs que cambian (índice único por organización).
  update public.branches b
     set slug = null
    from jsonb_array_elements(p_sedes) e
   where b.id = (e->>'id')::integer
     and b.organization_id = p_org
     and b.slug is distinct from nullif(e->>'slug', '');

  for v_s in select * from jsonb_array_elements(p_sedes) loop
    update public.branches
       set is_web_published = coalesce((v_s->>'publicada')::boolean, false),
           slug = nullif(v_s->>'slug', ''),
           is_web_stock_source = coalesce((v_s->>'fuenteStock')::boolean, true),
           updated_at = now()
     where id = (v_s->>'id')::integer
       and organization_id = p_org;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function public.fn_sitio_web_guardar_sedes(integer, text, jsonb) from public, anon;
grant execute on function public.fn_sitio_web_guardar_sedes(integer, text, jsonb) to authenticated;

comment on function public.fn_sitio_web_guardar_sedes(integer, text, jsonb) is
  'Sitio web › Sedes en la web: guarda modo, publicación, dirección (slug) y fuente de stock de las sedes en una transacción. Exige website.sites.edit.';
