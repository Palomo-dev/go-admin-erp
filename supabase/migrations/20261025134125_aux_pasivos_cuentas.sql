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
-- [CONFIRMAR con el contador el destino de RETE_11 / 23650502.]
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
      ('23654001', '236540', 'Retención compras',                          true,  22)
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
begin
  -- 1. tax_account_mapping primero (antes de que 23650501 exista).
  for r in select m.id, m.organization_id, m.account_code, upper(coalesce(tt.code, tt2.code, '')) cod,
                  upper(coalesce(tt.name, tt2.name, '')) nom
             from public.tax_account_mapping m
             left join public.tax_templates tt on tt.id = m.tax_template_id
             left join public.organization_taxes ot on ot.id = m.organization_tax_id
             left join public.tax_templates tt2 on tt2.id = ot.template_id
            where m.account_code in ('23650501', '23650502') loop
    v_nuevo := case
      when r.cod ~ 'ICA|IVA' or r.nom ~ 'ICA|IVA' then null  -- no es retefuente: no se toca
      when r.cod = 'RETE_4' or r.nom ~ 'SERVICIO' then '23652501'
      when r.cod in ('RETE_10', 'RETE_11') or r.nom ~ 'HONORARIO' then '23651501'
      when r.nom ~ 'ARREND|ARRIEND' then '23653001'
      when r.nom ~ 'COMISI' then '23652001'
      else '23654001' end;
    continue when v_nuevo is null;
    update public.tax_account_mapping set account_code = v_nuevo, updated_at = now() where id = r.id;
    insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
    values ('134125', r.organization_id, 'tax_account_mapping', r.id::text, 'account_code', r.account_code, v_nuevo);
    v_m := v_m + 1;
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
