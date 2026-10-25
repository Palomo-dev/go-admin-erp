-- Auxiliares de pasivos del contador (comisiones_auxiliares_contador_25oct.md), paso 1 de 4: CUENTAS. NO aplicada.
-- Requiere 134070…134120 (hoteles/contador) y 134090…134100 (comisiones). Orden de despliegue: HOTELES antes que COMISIONES.
-- Solo crea (idempotente; inserta lo que falta, nunca cambia una cuenta existente), en TODAS las orgs que tengan la madre:
--   2205 → 220505 Proveedores nacionales (título) → 22050501 Proveedores nacionales (mercancía de inventario)
--   2505 → 250505 Salarios por pagar → 25050501 nómina, 25050502 comisiones por pagar a empleados
--   2335 → 233520 Comisiones → 23352001 a terceros, 23352002 a OTA; 233595 Otros → 23359501 otros costos y gastos
--   2365 → 236505/23650501 salarios y pagos laborales, 236515/23651501 honorarios, 236520/23652001 comisiones,
--          236525/23652501 servicios, 236530/23653001 arrendamientos, 236540/23654001 compras (DEFECTO)
-- trg_puc_validar_cuenta se desactiva durante los INSERT: 2205/2505/2335/2365 siguen de movimiento hasta que 134135
-- repunte todo y reclasifique; solo entonces pasan a título. Siembra de orgs nuevas: fn_sembrar_configuracion_contable
-- (134130) llama a fn_pasivos_asegurar_auxiliares.
-- tax_account_mapping (F-43: 96 filas / 48 orgs con 23650501/23650502, cuentas que NO existían): ANTES de que exista
-- 23650501 (= retención NÓMINA según el contador) se repuntan por plantilla, para que la retención de compras no caiga
-- en nómina: RETE_4 (4%, servicios) → 23652501; RETE_11 (11%, honorarios/comisiones) → 23651501; otra → 23654001.
-- AJUSTE 25-oct (contador): RETE_11 se divide: «Retención honorarios 11%» (RETE_11, 23651501; las 48 filas existentes
-- quedan como honorarios) y «Retención comisiones 11%» (RETE_11_COMISION nueva, 23652001, mapeo en las mismas orgs).
-- ReteIVA/ReteICA: compras 23670501/23680501 (236705/236805), ventas 13551701/13551801 y retefuente que nos practican
-- 13551501 (bajo 135515/135517/135518). 2026: 0 saldo en 2365*/2367*/2368*/1355* → nada que reclasificar.
-- Bitácora p1_puc_bitacora migracion '134125'. Rollback: supabase/rollbacks/20261025134125_aux_pasivos_cuentas_rollback.sql

create or replace function public.fn_pasivos_asegurar_auxiliares(p_org integer, p_migracion text default null)
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
      ('220505',   '2205',   'Proveedores nacionales',                     false,  1),
      ('22050501', '220505', 'Proveedores nacionales',                     true,   2),
      ('250505',   '2505',   'Salarios por pagar',                         false,  3),
      ('25050501', '250505', 'Salarios por pagar',                         true,   4),
      ('25050502', '250505', 'Comisiones por pagar a empleados',           true,   5),
      ('233520',   '2335',   'Comisiones',                                 false,  6),
      ('23352001', '233520', 'Comisiones por pagar a terceros',            true,   7),
      ('23352002', '233520', 'Comisiones por pagar a OTA',                 true,   8),
      ('233595',   '2335',   'Otros',                                      false,  9),
      ('23359501', '233595', 'Otros costos y gastos por pagar',            true,  10),
      ('236505',   '2365',   'Salarios y pagos laborales',                 false, 11),
      ('23650501', '236505', 'Retención salarios y pagos laborales',       true,  12),
      ('236515',   '2365',   'Honorarios',                                 false, 13),
      ('23651501', '236515', 'Retención honorarios',                       true,  14),
      ('236520',   '2365',   'Comisiones',                                 false, 15),
      ('23652001', '236520', 'Retención comisiones',                       true,  16),
      ('236525',   '2365',   'Servicios',                                  false, 17),
      ('23652501', '236525', 'Retención servicios',                        true,  18),
      ('236530',   '2365',   'Arrendamientos',                             false, 19),
      ('23653001', '236530', 'Retención arrendamientos',                   true,  20),
      ('236540',   '2365',   'Compras',                                    false, 21),
      ('23654001', '236540', 'Retención compras',                          true,  22),
      -- AJUSTE (M7): ReteIVA/ReteICA practicados (compras) y retenciones que nos practican (ventas, 1355).
      ('236705',   '2367',   'Impuesto a las ventas retenido',             false, 23),
      ('23670501', '236705', 'ReteIVA por pagar',                          true,  24),
      ('236805',   '2368',   'Impuesto de industria y comercio retenido',  false, 25),
      ('23680501', '236805', 'ReteICA por pagar',                          true,  26),
      ('13551501', '135515', 'Retención en la fuente que nos practicaron', true,  27),
      ('13551701', '135517', 'ReteIVA que nos practicaron',                true,  28),
      ('13551801', '135518', 'ReteICA que nos practicaron',                true,  29)
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
        values (p_migracion, p_org, 'cuenta_nueva', r.codigo, r.nombre);
      end if;
    end if;
  end loop;
  return v_n;
end;
$function$;
revoke all on function public.fn_pasivos_asegurar_auxiliares(integer, text) from public, anon, authenticated;

do $$
declare
  r record;
  v_nuevo text;
  v_org integer;
  v_n integer := 0;
  v_m integer := 0;
  v_txt text;
begin
  -- AJUSTE: el trigger diferido trg_chart_cuenta_titulo_configurada no puede tener eventos pendientes al hacer
  -- ALTER TABLE … DISABLE TRIGGER ("pending trigger events"): se fuerza immediate ANTES.
  set constraints public.trg_chart_cuenta_titulo_configurada immediate;
  -- 0. AJUSTE: RETE_11 se divide en dos conceptos. La plantilla existente (y sus filas) queda como honorarios;
  --    se crea «Retención comisiones 11%» (RETE_11_COMISION). Bitácora con organization_id 0 (plantilla global).
  select tt.name into v_txt from public.tax_templates tt where tt.code = 'RETE_11';
  if v_txt is not null and v_txt <> 'Retención honorarios 11%' then
    update public.tax_templates set name = 'Retención honorarios 11%', updated_at = now() where code = 'RETE_11';
    insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
    values ('134125', 0, 'tax_templates', 'RETE_11', 'name', v_txt, 'Retención honorarios 11%');
  end if;
  if not exists (select 1 from public.tax_templates where code = 'RETE_11_COMISION') then
    insert into public.tax_templates (country, code, name, rate, description, kind, created_at, updated_at)
    values ('COL', 'RETE_11_COMISION', 'Retención comisiones 11%', 11, 'Retención en la fuente por comisiones (art. 392 ET)',
            'withholding', now(), now());
    insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, valor_nuevo)
    values ('134125', 0, 'tax_template_nuevo', 'RETE_11_COMISION', 'Retención comisiones 11%');
  end if;

  -- 1. tax_account_mapping primero (antes de que 23650501 exista). RETE_4 → 23652501 (servicios); RETE_11 →
  --    23651501 (honorarios); ReteIVA → 23670501 y ReteICA → 23680501 (compras) si la org tiene la madre 2367/2368
  --    (en prod ICA_0.966 apunta a 23170501 en 48 orgs; ReteIVA sin mapeo).
  for r in select m.id, m.organization_id, m.account_code, upper(coalesce(tt.code, tt2.code, '')) cod,
                  upper(coalesce(tt.name, tt2.name, ot.name, '')) nom,
                  public.fn_clase_retencion(coalesce(tt.code, tt2.code), coalesce(ot.name, tt.name)) clase
             from public.tax_account_mapping m
             left join public.tax_templates tt on tt.id = m.tax_template_id
             left join public.organization_taxes ot on ot.id = m.organization_tax_id
             left join public.tax_templates tt2 on tt2.id = ot.template_id
            where coalesce(tt.kind, tt2.kind, ot.kind) = 'withholding' or m.account_code in ('23650501', '23650502') loop
    v_nuevo := case
      when r.clase = 'reteica' then '23680501'
      when r.clase = 'reteiva' then '23670501'
      when r.account_code not in ('23650501', '23650502') then null  -- retefuente ya configurada: no se toca
      when r.cod = 'RETE_4' or r.nom ~ 'SERVICIO' then '23652501'
      when r.cod = 'RETE_11_COMISION' or r.nom ~ 'COMISI' then '23652001'
      when r.cod in ('RETE_10', 'RETE_11') or r.nom ~ 'HONORARIO' then '23651501'
      when r.nom ~ 'ARREND|ARRIEND' then '23653001'
      else '23654001' end;
    continue when v_nuevo is null or v_nuevo = r.account_code;
    continue when v_nuevo in ('23670501', '23680501') and not exists (
      select 1 from public.chart_of_accounts c where c.organization_id = r.organization_id and c.account_code = left(v_nuevo, 4));
    update public.tax_account_mapping set account_code = v_nuevo, updated_at = now() where id = r.id;
    insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
    values ('134125', r.organization_id, 'tax_account_mapping', r.id::text, 'account_code', r.account_code, v_nuevo);
    v_m := v_m + 1;
  end loop;
  -- 1b. Mapeo nuevo RETE_11_COMISION → 23652001 en las orgs que ya mapean RETE_11 (mismas 48 orgs).
  for r in select distinct m.organization_id from public.tax_account_mapping m
             join public.tax_templates tt on tt.id = m.tax_template_id and tt.code = 'RETE_11'
            where exists (select 1 from public.chart_of_accounts c where c.organization_id = m.organization_id and c.account_code = '2365')
              and not exists (select 1 from public.tax_account_mapping x join public.tax_templates t2 on t2.id = x.tax_template_id
                               where x.organization_id = m.organization_id and t2.code = 'RETE_11_COMISION') loop
    insert into public.tax_account_mapping (organization_id, tax_template_id, account_code, account_type, is_active, created_at, updated_at)
    select r.organization_id, tt.id, '23652001', 'tax_payable', true, now(), now()
      from public.tax_templates tt where tt.code = 'RETE_11_COMISION'
    returning id::text into v_txt;
    insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, valor_nuevo)
    values ('134125', r.organization_id, 'tax_account_mapping_nuevo', v_txt, '23652001');
  end loop;

  -- 2. auxiliares
  alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta;
  for v_org in select o.id from public.organizations o order by 1 loop
    v_n := v_n + public.fn_pasivos_asegurar_auxiliares(v_org, '134125');
  end loop;
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
  raise notice '134125: % cuentas creadas, % filas de tax_account_mapping repuntadas (esperado 96)', v_n, v_m;
exception when others then
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
  raise;
end $$;

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261025134125', 'aux_pasivos_cuentas', array[]::text[], 'p1_apply_executor')
on conflict (version) do nothing;
