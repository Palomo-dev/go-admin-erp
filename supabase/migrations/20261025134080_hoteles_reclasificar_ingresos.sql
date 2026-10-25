-- Hoteles (type_id 2), 25-oct-2026: pasa los 43 hoteles existentes a los auxiliares de 134070. NO aplicada.
-- Paso 3 de 4. Requiere 134070. Por cada org type_id = 2:
--   1b. Reglas de venta (sale/created), cargo a folio y no-show con crédito 41xx -> auxiliar. Folio por prioridad
--       (la que usa fn_auto_journal_folio_item): 10 hospedaje 41400501, 11 alimentos 41401501, 12 otros servicios
--       41409501; venta y no-show 41400501. Folio 30/31 -> 11/12 y regla de hospedaje (10) si falta.
--       Comisiones, devoluciones y orgs tipo 1 no se tocan.
--   1. Reglas (accounting_rules): débito/crédito 4140 -> 41400501, 4175 -> 41750101; descuento 4175 -> 41750102.
--   2. configuracion_contable: ventas_productos/ventas_servicios 4140 -> 41400501, devoluciones 4175 -> 41750101,
--      descuentos 4175 -> 41750102 (cualquier otra clave en 4140/4175 -> 41400501/41750101).
--   3. categorias_tesoreria.cuenta_sugerida 4175 -> 41750101.
--   4. Borradores (posted = false): líneas 4140 -> 41400501, 4175 -> 41750101 (org 130: asiento 49706, 29.500.000).
--   5. Saldos contabilizados en 4140/4175: asiento de reclasificación (mismo tipo que 134060; source
--      'reclasificacion_titulo', fact_key 'hoteles_reclasif_ingresos'). Al 25-oct no hay ninguno.
--   6. 4140 y 4175 pasan a TÍTULO solo si ya nada las referencia (regla activa, clave, categoría, mapeo o borrador)
--      y su saldo contabilizado es 0. Si no, aviso y quedan de movimiento.
-- Todo cambio queda en p1_puc_bitacora (migracion '134080'). Fecha del asiento: hoy (fecha UTC del servidor:
-- aplicar antes de las 19:00 COT) si el período mensual está abierto; si no, el primer período abierto posterior.
-- No toca organizations, ni org 331 (no es hotel; borrador 49729 intacto).
-- Rollback: supabase/rollbacks/20261025134080_hoteles_reclasificar_ingresos_rollback.sql

create or replace function pg_temp.hot_aux(p_cta text, p_descuento boolean default false)
returns text language sql immutable as $$
  select case p_cta when '4140' then '41400501'
                    when '4175' then case when p_descuento then '41750102' else '41750101' end end
$$;

do $$
declare
  v_org integer;
  r record;
  v_fecha date;
  v_branch integer;
  v_entry integer;
  v_ref boolean;
  v_txt text;
begin
  for v_org in select o.id from public.organizations o where o.type_id = 2 order by 1 loop
    if exists (select 1 from (values ('41400501'), ('41750101'), ('41750102')) v(c)
                where not exists (select 1 from public.chart_of_accounts a where a.organization_id = v_org
                                    and a.account_code = v.c and a.es_movimiento is true)) then
      raise exception '134080: org % sin auxiliares de 134070; abortar', v_org;
    end if;

    -- 1. reglas
    for r in select id, debit_account_code d, credit_account_code c, discount_account_code x
               from public.accounting_rules where organization_id = v_org
                and (debit_account_code in ('4140','4175') or credit_account_code in ('4140','4175')
                     or discount_account_code in ('4140','4175')) loop
      if r.d in ('4140','4175') then
        update public.accounting_rules set debit_account_code = pg_temp.hot_aux(r.d), updated_at = now() where id = r.id;
        insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
        values ('134080', v_org, 'accounting_rules', r.id::text, 'debit_account_code', r.d, pg_temp.hot_aux(r.d));
      end if;
      if r.c in ('4140','4175') then
        update public.accounting_rules set credit_account_code = pg_temp.hot_aux(r.c), updated_at = now() where id = r.id;
        insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
        values ('134080', v_org, 'accounting_rules', r.id::text, 'credit_account_code', r.c, pg_temp.hot_aux(r.c));
      end if;
      if r.x in ('4140','4175') then
        update public.accounting_rules set discount_account_code = pg_temp.hot_aux(r.x, true), updated_at = now() where id = r.id;
        insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
        values ('134080', v_org, 'accounting_rules', r.id::text, 'discount_account_code', r.x, pg_temp.hot_aux(r.x, true));
      end if;
    end loop;

    -- 1b. (QA Soporte) reglas de ingreso de hotel: venta (sale/created), cargo a folio y no-show con crédito en una
    --     cuenta de ingreso que no es el auxiliar del contador (4101, 4105, 4110, 4115, 413505...). Solo el crédito;
    --     comisiones y devoluciones no se tocan. fn_auto_journal_folio_item elige la regla de folio por PRIORIDAD
    --     (10 room/hospedaje, 11 pos/food/minibar, 12 resto), así que el auxiliar sale de la prioridad.
    --     Las reglas de folio de la plantilla nueva (prioridad 30/31, sin regla de hospedaje) pasan a 11/12 y se
    --     agrega 'Cargo Folio Hospedaje' (10) si la org no tiene regla de folio con prioridad 10.
    for r in select x.id, x.priority p, x.name from public.accounting_rules x
              where x.organization_id = v_org and x.source_type = 'folio_item' and x.event_type = 'created'
                and x.priority not in (10, 11, 12) and (x.name ilike '%aliment%' or x.name ilike '%servic%') loop
      update public.accounting_rules set priority = case when r.name ilike '%aliment%' then 11 else 12 end, updated_at = now()
       where id = r.id;
      insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
      values ('134080', v_org, 'accounting_rules', r.id::text, 'priority', r.p::text,
              case when r.name ilike '%aliment%' then '11' else '12' end);
    end loop;
    if exists (select 1 from public.accounting_rules x where x.organization_id = v_org and x.source_type = 'folio_item'
                 and x.event_type = 'created' and x.is_active)
       and not exists (select 1 from public.accounting_rules x where x.organization_id = v_org and x.source_type = 'folio_item'
                         and x.event_type = 'created' and x.is_active and x.priority = 10) then
      insert into public.accounting_rules (organization_id, name, description, source_type, event_type,
        debit_account_code, credit_account_code, tax_account_code, use_tax_from_document, priority, is_active, conditions)
      values (v_org, 'Cargo Folio Hospedaje', 'Cargo a folio por alojamiento', 'folio_item', 'created',
        '1305', '41400501', null, false, 10, true, '{"source": "room"}'::jsonb)
      returning id::text into v_txt;
      insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_nuevo)
      values ('134080', v_org, 'accounting_rules_nueva', v_txt, 'insert', 'Cargo Folio Hospedaje 41400501');
    end if;
    for r in select x.id, x.credit_account_code c,
                    case
                      when x.source_type = 'folio_item' and x.priority = 10 then '41400501'
                      when x.source_type = 'folio_item' and x.priority = 11 then '41401501'
                      when x.source_type = 'folio_item' then '41409501'
                      else '41400501'
                    end nuevo
               from public.accounting_rules x
              where x.organization_id = v_org and x.credit_account_code like '41%'
                and ((x.source_type in ('sale', 'folio_item') and x.event_type = 'created')
                     or (x.source_type = 'reservation' and x.event_type = 'no_show')) loop
      continue when r.c = r.nuevo;
      update public.accounting_rules set credit_account_code = r.nuevo, updated_at = now() where id = r.id;
      insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
      values ('134080', v_org, 'accounting_rules', r.id::text, 'credit_account_code', r.c, r.nuevo);
    end loop;

    -- 2. claves
    for r in select id, clave, account_code from public.configuracion_contable
              where organization_id = v_org and account_code in ('4140','4175') loop
      update public.configuracion_contable set account_code = pg_temp.hot_aux(r.account_code, r.clave = 'descuentos')
       where id = r.id;
      insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
      values ('134080', v_org, 'configuracion_contable', r.id::text, r.clave, r.account_code,
              pg_temp.hot_aux(r.account_code, r.clave = 'descuentos'));
    end loop;

    -- 3. categorías de tesorería
    for r in select id from public.categorias_tesoreria where organization_id = v_org and cuenta_sugerida = '4175' loop
      update public.categorias_tesoreria set cuenta_sugerida = '41750101' where id = r.id;
      insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
      values ('134080', v_org, 'categorias_tesoreria', r.id::text, 'cuenta_sugerida', '4175', '41750101');
    end loop;

    -- 4. borradores
    for r in select l.id, l.account_code from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
              where l.organization_id = v_org and l.account_code in ('4140','4175') and e.posted is not true loop
      update public.journal_lines set account_code = pg_temp.hot_aux(r.account_code) where id = r.id;
      insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
      values ('134080', v_org, 'journal_lines', r.id::text, 'account_code', r.account_code, pg_temp.hot_aux(r.account_code));
    end loop;

    -- 5. saldos contabilizados
    if exists (select 1 from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                where l.organization_id = v_org and l.account_code in ('4140','4175') and e.posted is true
                group by l.account_code having sum(l.debit - l.credit) <> 0) then
      select case
               when exists (select 1 from public.fiscal_periods fp where fp.organization_id = v_org
                              and fp.period_type = 'monthly' and fp.status = 'open'
                              and current_date between fp.start_date and fp.end_date) then current_date
               else (select min(fp.start_date) from public.fiscal_periods fp where fp.organization_id = v_org
                        and fp.period_type = 'monthly' and fp.status = 'open' and fp.start_date > current_date)
             end into v_fecha;
      if v_fecha is null then
        raise exception '134080: org % tiene saldo en 4140/4175 y no tiene período abierto', v_org;
      end if;
      select b.id into v_branch from public.branches b where b.organization_id = v_org order by b.is_main desc nulls last, b.id limit 1;
      insert into public.journal_entries (organization_id, branch_id, entry_date, memo, posted, source, source_id, fact_key, created_at, updated_at)
      values (v_org, v_branch, (v_fecha::text || ' 12:00 America/Bogota')::timestamptz, 'Reclasificación a auxiliar de movimiento',
              true, 'reclasificacion_titulo', '4140,4175', 'hoteles_reclasif_ingresos', now(), now())
      returning id into v_entry;
      insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, organization_id, debit_base, credit_base)
      select v_entry, x.cta, x.descr, greatest(x.s, 0), greatest(-x.s, 0), v_org, greatest(x.s, 0), greatest(-x.s, 0)
        from (select pg_temp.hot_aux(l.account_code) cta, 'Reclasificación a auxiliar de movimiento (desde ' || l.account_code || ')' descr,
                     sum(l.debit - l.credit) s
                from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
               where l.organization_id = v_org and l.account_code in ('4140','4175') and e.posted is true and e.id <> v_entry
               group by l.account_code having sum(l.debit - l.credit) <> 0
              union all
              select l.account_code, 'Reclasificación a auxiliar de movimiento (hacia ' || pg_temp.hot_aux(l.account_code) || ')',
                     -sum(l.debit - l.credit)
                from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
               where l.organization_id = v_org and l.account_code in ('4140','4175') and e.posted is true and e.id <> v_entry
               group by l.account_code having sum(l.debit - l.credit) <> 0) x;
      insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_nuevo)
      values ('134080', v_org, 'journal_entries', v_entry::text, 'reclasificacion', 'hoteles_reclasif_ingresos');
    end if;

    -- 6. títulos
    for r in select a.account_code from public.chart_of_accounts a
              where a.organization_id = v_org and a.account_code in ('4140','4175') and a.es_movimiento is not false loop
      v_ref := exists (select 1 from public.accounting_rules x where x.organization_id = v_org and x.is_active
                         and r.account_code in (x.debit_account_code, x.credit_account_code, x.discount_account_code, x.tax_account_code))
            or exists (select 1 from public.configuracion_contable x where x.organization_id = v_org and x.account_code = r.account_code)
            or exists (select 1 from public.categorias_tesoreria x where x.organization_id = v_org and x.cuenta_sugerida = r.account_code)
            or exists (select 1 from public.branch_account_mappings x where x.organization_id = v_org
                         and r.account_code in (x.base_account_code, x.sub_account_code))
            or exists (select 1 from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                        where l.organization_id = v_org and l.account_code = r.account_code and e.posted is not true)
            or coalesce((select sum(l.debit - l.credit) from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                          where l.organization_id = v_org and l.account_code = r.account_code and e.posted is true), 0) <> 0;
      if v_ref then
        raise notice '134080: org % cuenta % sigue referenciada; queda de movimiento', v_org, r.account_code;
      else
        update public.chart_of_accounts set es_movimiento = false, updated_at = now()
         where organization_id = v_org and account_code = r.account_code;
        insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
        values ('134080', v_org, 'cuenta', r.account_code, 'es_movimiento', 'true', 'false');
      end if;
    end loop;
  end loop;
end $$;
