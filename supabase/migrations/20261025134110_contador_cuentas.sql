-- Contador 25-oct-2026 (hoteles_decisiones_contador_25oct.md), paso 1 de 3: CUENTAS. NO aplicada.
-- Requiere 134070…134105. Solo crea (idempotente, inserta lo que falta; nunca cambia una cuenta existente):
--   Restaurantes (type_id 1, las 13 orgs, incluida la 140) y su siembra (fn_sembrar_configuracion_contable, 134115):
--     2495 → 249505 «Impuesto nacional al consumo» (título) → 24950501 «INC 8% por pagar» (movimiento)
--     414015 → 41401501 «Ingresos por alimentos» (movimiento)
--   Hoteles (type_id 2, 43 orgs) y su siembra (fn_hoteles_asegurar_cuentas_ingreso):
--     414095 → 41409502 «Ingresos por no-show y cancelaciones» (movimiento)
-- Igual que 134070: trg_puc_validar_cuenta se desactiva durante los INSERT para que 2495/414015/414095 sigan de
-- movimiento hasta que 134120 repunte reglas/claves y reclasifique saldos; solo entonces pasan a título.
-- chart_of_accounts.activa es GENERADA: no se inserta. Bitácora p1_puc_bitacora migracion '134110', objeto 'cuenta_nueva'.
-- Rollback: supabase/rollbacks/20261025134110_contador_cuentas_rollback.sql

create or replace function public.fn_restaurantes_asegurar_cuentas(p_org integer, p_migracion text default null)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select * from (values
      ('249505',   '2495',   'Impuesto nacional al consumo', false, 1),
      ('24950501', '249505', 'INC 8% por pagar',             true,  2),
      ('414015',   '4140',   'Restaurantes',                 false, 3),
      ('41401501', '414015', 'Ingresos por alimentos',       true,  4)
    ) as t(codigo, padre, nombre, mov, orden)
    order by orden
  loop
    continue when exists (select 1 from public.chart_of_accounts
                           where organization_id = p_org and account_code = r.codigo);
    continue when not exists (select 1 from public.chart_of_accounts
                               where organization_id = p_org and account_code = r.padre);
    insert into public.chart_of_accounts (
      organization_id, account_code, name, type, parent_code, is_active,
      naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo, centro_costo_modo,
      presentacion_niif, created_at, updated_at)
    select p_org, r.codigo, r.nombre, p.type, r.padre, true,
           p.naturaleza, r.mov, coalesce(p.requiere_tercero, false), p.requiere_centro_costo,
           p.centro_costo_modo, p.presentacion_niif, now(), now()
      from public.chart_of_accounts p
     where p.organization_id = p_org and p.account_code = r.padre
    on conflict (organization_id, account_code) do nothing;
    if found then
      v_n := v_n + 1;
      if p_migracion is not null then
        insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, valor_nuevo)
        values (p_migracion, p_org, 'cuenta_nueva', r.codigo, r.nombre);
      end if;
    end if;
  end loop;
  return v_n;
end;
$function$;
revoke all on function public.fn_restaurantes_asegurar_cuentas(integer, text) from public, anon, authenticated;

create or replace function public.fn_hoteles_asegurar_cuentas_ingreso(p_org integer, p_migracion text default null)
returns integer
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  r record;
  v_n integer := 0;
begin
  for r in
    select * from (values
      ('414005',   '4140',   'Hotelería',                                    false,  1),
      ('41400501', '414005', 'Ingresos por alojamiento',                     true,   2),
      ('414015',   '4140',   'Restaurantes',                                 false,  3),
      ('41401501', '414015', 'Ingresos por alimentos',                       true,   4),
      ('414020',   '4140',   'Bares y cantinas',                             false,  5),
      ('41402001', '414020', 'Ingresos por bebidas y bar',                   true,   6),
      ('414095',   '4140',   'Otros',                                        false,  7),
      ('41409501', '414095', 'Ingresos por otros servicios hoteleros',       true,   8),
      ('41409502', '414095', 'Ingresos por no-show y cancelaciones',         true,   8),
      ('417501',   '4175',   'Devoluciones, rebajas y descuentos en ventas', false,  9),
      ('41750101', '417501', 'Devoluciones en ventas',                       true,  10),
      ('41750102', '417501', 'Rebajas y descuentos en ventas',               true,  11)
    ) as t(codigo, padre, nombre, mov, orden)
    order by orden   -- todo padre antes que sus hijos
  loop
    continue when exists (select 1 from public.chart_of_accounts
                           where organization_id = p_org and account_code = r.codigo);
    continue when not exists (select 1 from public.chart_of_accounts
                               where organization_id = p_org and account_code = r.padre);
    insert into public.chart_of_accounts (
      organization_id, account_code, name, type, parent_code, is_active,
      naturaleza, es_movimiento, requiere_tercero, requiere_centro_costo, centro_costo_modo,
      presentacion_niif, created_at, updated_at)
    select p_org, r.codigo, r.nombre, p.type, r.padre, true,
           p.naturaleza, r.mov, coalesce(p.requiere_tercero, false), p.requiere_centro_costo,
           p.centro_costo_modo, p.presentacion_niif, now(), now()
      from public.chart_of_accounts p
     where p.organization_id = p_org and p.account_code = r.padre
    on conflict (organization_id, account_code) do nothing;
    if found then
      v_n := v_n + 1;
      if p_migracion is not null then
        insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, valor_nuevo)
        values (p_migracion, p_org, case when p_migracion = '134070' then 'cuenta' else 'cuenta_nueva' end, r.codigo, r.nombre);
      end if;
    end if;
  end loop;
  return v_n;
end;
$function$;
revoke all on function public.fn_hoteles_asegurar_cuentas_ingreso(integer, text) from public, anon, authenticated;

do $$
declare
  v_org integer;
  v_r integer := 0;
  v_h integer := 0;
begin
  alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta;
  for v_org in select o.id from public.organizations o where o.type_id = 1 order by 1 loop
    v_r := v_r + public.fn_restaurantes_asegurar_cuentas(v_org, '134110');
  end loop;
  for v_org in select o.id from public.organizations o where o.type_id = 2 order by 1 loop
    v_h := v_h + public.fn_hoteles_asegurar_cuentas_ingreso(v_org, '134110');
  end loop;
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
  raise notice '134110: % cuentas en restaurantes (esperado 13 x 3 = 39), % en hoteles (esperado 43 x 1 = 43)', v_r, v_h;
exception when others then
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
  raise;
end $$;
