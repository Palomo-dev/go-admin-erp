-- Contador 25-oct-2026 (hoteles_decisiones_contador_25oct.md), paso 3 de 3: DATOS. NO aplicada.
-- Requiere 134110 (cuentas) y 134115 (funciones). Orden del contador en cada org: auxiliar ya creado (134110) →
-- repuntar reglas/claves/borradores → reclasificar saldo con asiento FECHADO '2026-10-25' 12:00 COT (explícito) →
-- solo entonces el padre pasa a TÍTULO (si nada lo referencia y su saldo contabilizado es 0). Idempotente
-- (fact_key por org; repuntes solo sobre lo que aún apunta a la cuenta vieja). Exige octubre 2026 abierto.
-- HOTELES (type_id 2):
--   a. Reglas con 4105 (error de plantilla): débito 4105 (devolución, anulación por NC, reembolso) -> 41750101;
--      crédito 4105: viaje/tour 41409501, parking/transporte 41409501, no-show 41409502, resto (caja, folio
--      hospedaje, venta) 41400501.
--   b. No-show: crédito -> 41409502 y use_tax_from_document = false (IVA configurable, no automático). Regla nueva
--      'Reserva no presentada' D2805 C41409502 donde falte (al 25-oct: 130, 133, 136, 326).
--   c. 'Cargo Folio Bar' (prioridad 13, C41402001) en hoteles con reglas de folio que no la tengan.
--   d. Claves en 4105 -> 41400501 (devoluciones 41750101). Borradores en 4105: débito 41750101, crédito 41400501.
--   e. Saldo contabilizado en 4105: asiento 'contador_reclasif_4105:<org>'. Créditos de viaje -> 41409501, demás
--      créditos y débitos de reversión -> 41400501, demás débitos (devoluciones/anulaciones/reembolsos) -> 41750101.
--      4105 no pasa a título (sigue en el plan; ninguna regla de hotel la usa ya).
-- RESTAURANTES (type_id 1):
--   f. Claves/reglas/borradores 414015 -> 41401501 y 2495 -> 24950501; clave impuesto_consumo = 24950501 si falta.
--      Reglas de venta / NC / anulación con impuesto 2405/2408/240805/24080501 -> 24950501 (orgs con INC activo).
--   g. Saldo contabilizado en 414015 -> 41401501, asiento 'contador_reclasif_414015:<org>' (al 25-oct: 140 y 142).
--   h. Org 140: saldo de 2408 (título; -1.600 de la venta POS 26ed882f, asiento 47437, INC 8%) -> 24950501, asiento
--      'contador_reclasif_inc_2408:140'. 2408 es título: se habilita de movimiento SOLO durante el insert y vuelve a
--      título en la misma transacción. Si el saldo no es exactamente -1.600, aborta.
--   i. 414015 y 2495 pasan a título (si quedan sin referencias y en 0).
-- No toca organizations. Bitácora p1_puc_bitacora migracion '134120' (cuentas con su valor_anterior real).
-- Rollback: supabase/rollbacks/20261025134120_contador_datos_rollback.sql

create or replace function pg_temp.c_log(p_org integer, p_obj text, p_clave text, p_campo text, p_ant text, p_nuevo text)
returns void language sql as $$
  insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
  values ('134120', p_org, p_obj, p_clave, p_campo, p_ant, p_nuevo);
$$;

-- Asiento de reclasificación desde la tabla temporal c_lin (cuenta, monto debe-haber). Devuelve el id o null.
create or replace function pg_temp.c_asiento(p_org integer, p_fact text, p_source_id text)
returns integer language plpgsql as $$
declare v_branch integer; v_entry integer;
begin
  if not exists (select 1 from c_lin where round(s, 2) <> 0) then return null; end if;
  if (select round(sum(s), 2) from c_lin) <> 0 then
    raise exception '134120: asiento % org % no cuadra', p_fact, p_org;
  end if;
  if not exists (select 1 from public.fiscal_periods fp where fp.organization_id = p_org and fp.period_type = 'monthly'
                   and fp.status = 'open' and date '2026-10-25' between fp.start_date and fp.end_date) then
    raise exception '134120: org % con octubre 2026 cerrado; abrir el período antes de aplicar', p_org;
  end if;
  select b.id into v_branch from public.branches b where b.organization_id = p_org order by b.is_main desc nulls last, b.id limit 1;
  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, posted, source, source_id, fact_key, created_at, updated_at)
  values (p_org, v_branch, '2026-10-25 12:00 America/Bogota'::timestamptz, 'Reclasificación decisión contador 25-oct-2026',
          true, 'reclasificacion_titulo', p_source_id, p_fact, now(), now())
  returning id into v_entry;
  insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, organization_id, debit_base, credit_base)
  select v_entry, c.cta, 'Reclasificación decisión contador 25-oct-2026 (' || p_source_id || ')',
         greatest(round(c.s, 2), 0), greatest(-round(c.s, 2), 0), p_org, greatest(round(c.s, 2), 0), greatest(-round(c.s, 2), 0)
    from c_lin c where round(c.s, 2) <> 0;
  perform pg_temp.c_log(p_org, 'journal_entries', v_entry::text, 'reclasificacion', null, p_fact);
  return v_entry;
end $$;

drop table if exists c_lin;
create temp table c_lin (cta text, s numeric);

do $$
declare
  v_org integer;
  r record;
  v_nuevo text;
  v_txt text;
  v_inc boolean;
  v_s numeric;
begin
  -- ===================== HOTELES =====================
  for v_org in select o.id from public.organizations o where o.type_id = 2 order by 1 loop
    if exists (select 1 from (values ('41400501'), ('41402001'), ('41409501'), ('41409502'), ('41750101')) v(c)
                where not exists (select 1 from public.chart_of_accounts a where a.organization_id = v_org
                                    and a.account_code = v.c and a.es_movimiento is true)) then
      raise exception '134120: hotel % sin auxiliares 134070/134110; abortar', v_org;
    end if;

    -- a. reglas con 4105
    for r in select id, source_type st, event_type et, debit_account_code d, credit_account_code c
               from public.accounting_rules where organization_id = v_org
                and (debit_account_code = '4105' or credit_account_code = '4105') loop
      if r.d = '4105' then
        update public.accounting_rules set debit_account_code = '41750101', updated_at = now() where id = r.id;
        perform pg_temp.c_log(v_org, 'accounting_rules', r.id::text, 'debit_account_code', r.d, '41750101');
      end if;
      if r.c = '4105' then
        v_nuevo := case
          when r.st in ('trip', 'parking', 'parking_pass', 'transport') then '41409501'
          when r.st = 'reservation' and r.et = 'no_show' then '41409502'
          else '41400501' end;
        update public.accounting_rules set credit_account_code = v_nuevo, updated_at = now() where id = r.id;
        perform pg_temp.c_log(v_org, 'accounting_rules', r.id::text, 'credit_account_code', r.c, v_nuevo);
      end if;
    end loop;

    -- b. no-show
    for r in select id, credit_account_code c, use_tax_from_document u from public.accounting_rules
              where organization_id = v_org and source_type = 'reservation' and event_type = 'no_show' loop
      if r.c is distinct from '41409502' and r.c like '4%' then
        update public.accounting_rules set credit_account_code = '41409502', updated_at = now() where id = r.id;
        perform pg_temp.c_log(v_org, 'accounting_rules', r.id::text, 'credit_account_code', r.c, '41409502');
      end if;
      if r.u is true then
        update public.accounting_rules set use_tax_from_document = false, updated_at = now() where id = r.id;
        perform pg_temp.c_log(v_org, 'accounting_rules', r.id::text, 'use_tax_from_document', 'true', 'false');
      end if;
    end loop;
    if not exists (select 1 from public.accounting_rules where organization_id = v_org
                     and source_type = 'reservation' and event_type = 'no_show') then
      insert into public.accounting_rules (organization_id, name, description, source_type, event_type,
        debit_account_code, credit_account_code, tax_account_code, use_tax_from_document, priority, is_active)
      values (v_org, 'Reserva no presentada', 'No-show/cancelación: el anticipo pasa a 41409502 (IVA configurable)',
        'reservation', 'no_show', '2805', '41409502', null, false, 32, true)
      returning id::text into v_txt;
      perform pg_temp.c_log(v_org, 'accounting_rules_nueva', v_txt, 'insert', null, 'Reserva no presentada 41409502');
    end if;

    -- c. folio bar
    if exists (select 1 from public.accounting_rules x where x.organization_id = v_org and x.source_type = 'folio_item'
                 and x.event_type = 'created' and x.is_active)
       and not exists (select 1 from public.accounting_rules x where x.organization_id = v_org and x.source_type = 'folio_item'
                         and x.event_type = 'created' and x.priority = 13) then
      insert into public.accounting_rules (organization_id, name, description, source_type, event_type,
        debit_account_code, credit_account_code, tax_account_code, use_tax_from_document, priority, is_active, conditions)
      values (v_org, 'Cargo Folio Bar', 'Cargo a folio por bar y minibar', 'folio_item', 'created',
        '1305', '41402001', null, false, 13, true, '{"source": "minibar"}'::jsonb)
      returning id::text into v_txt;
      perform pg_temp.c_log(v_org, 'accounting_rules_nueva', v_txt, 'insert', null, 'Cargo Folio Bar 41402001');
    end if;

    -- d. claves y borradores en 4105
    for r in select id, clave, account_code from public.configuracion_contable where organization_id = v_org and account_code = '4105' loop
      v_nuevo := case when r.clave in ('devoluciones', 'descuentos') then '41750101' else '41400501' end;
      update public.configuracion_contable set account_code = v_nuevo where id = r.id;
      perform pg_temp.c_log(v_org, 'configuracion_contable', r.id::text, r.clave, r.account_code, v_nuevo);
    end loop;
    for r in select l.id, l.debit from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
              where l.organization_id = v_org and l.account_code = '4105' and e.posted is not true loop
      v_nuevo := case when r.debit > 0 then '41750101' else '41400501' end;
      update public.journal_lines set account_code = v_nuevo where id = r.id;
      perform pg_temp.c_log(v_org, 'journal_lines', r.id::text, 'account_code', '4105', v_nuevo);
    end loop;

    -- e. saldo contabilizado en 4105
    if not exists (select 1 from public.journal_entries where organization_id = v_org and fact_key = 'contador_reclasif_4105:' || v_org) then
      delete from c_lin;
      insert into c_lin (cta, s)
      select x.cta, sum(x.s) from (
        select case
                 when l.credit > 0 and e.source in ('trip', 'trips') then '41409501'
                 when l.credit > 0 then '41400501'
                 when e.source = 'reversal' then '41400501'
                 else '41750101' end cta,
               l.debit - l.credit s
          from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
         where l.organization_id = v_org and l.account_code = '4105' and e.posted is true) x
      group by x.cta;
      select coalesce(sum(s), 0) into v_s from c_lin;
      insert into c_lin values ('4105', -v_s);
      perform pg_temp.c_asiento(v_org, 'contador_reclasif_4105:' || v_org, '4105');
    end if;
  end loop;

  -- ===================== RESTAURANTES =====================
  for v_org in select o.id from public.organizations o where o.type_id = 1 order by 1 loop
    if exists (select 1 from (values ('24950501'), ('41401501')) v(c)
                where not exists (select 1 from public.chart_of_accounts a where a.organization_id = v_org
                                    and a.account_code = v.c and a.es_movimiento is true)) then
      raise exception '134120: restaurante % sin 24950501/41401501 (134110); abortar', v_org;
    end if;
    v_inc := exists (select 1 from public.organization_taxes ot where ot.organization_id = v_org and ot.is_active
                       and ot.kind = 'tax' and (ot.template_id = 39 or ot.name ilike '%consumo%'));

    -- f. claves
    for r in select id, clave, account_code from public.configuracion_contable
              where organization_id = v_org and account_code in ('414015', '2495') loop
      v_nuevo := case r.account_code when '414015' then '41401501' else '24950501' end;
      update public.configuracion_contable set account_code = v_nuevo where id = r.id;
      perform pg_temp.c_log(v_org, 'configuracion_contable', r.id::text, r.clave, r.account_code, v_nuevo);
    end loop;
    if not exists (select 1 from public.configuracion_contable where organization_id = v_org and clave = 'impuesto_consumo') then
      insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
      values (v_org, null, 'impuesto_consumo', '24950501') returning id::text into v_txt;
      perform pg_temp.c_log(v_org, 'configuracion_contable_nueva', v_txt, 'impuesto_consumo', null, '24950501');
    end if;
    -- f. reglas
    for r in select id, source_type st, event_type et, debit_account_code d, credit_account_code c,
                    discount_account_code x, tax_account_code t
               from public.accounting_rules where organization_id = v_org loop
      if r.d in ('414015', '2495') then
        v_nuevo := case r.d when '414015' then '41401501' else '24950501' end;
        update public.accounting_rules set debit_account_code = v_nuevo, updated_at = now() where id = r.id;
        perform pg_temp.c_log(v_org, 'accounting_rules', r.id::text, 'debit_account_code', r.d, v_nuevo);
      end if;
      if r.c in ('414015', '2495') then
        v_nuevo := case r.c when '414015' then '41401501' else '24950501' end;
        update public.accounting_rules set credit_account_code = v_nuevo, updated_at = now() where id = r.id;
        perform pg_temp.c_log(v_org, 'accounting_rules', r.id::text, 'credit_account_code', r.c, v_nuevo);
      end if;
      if r.x in ('414015', '2495') then
        v_nuevo := case r.x when '414015' then '41401501' else '24950501' end;
        update public.accounting_rules set discount_account_code = v_nuevo, updated_at = now() where id = r.id;
        perform pg_temp.c_log(v_org, 'accounting_rules', r.id::text, 'discount_account_code', r.x, v_nuevo);
      end if;
      if r.t = '2495'
         or (v_inc and r.t in ('2405', '2408', '240805', '24080501')
             and (r.st = 'sale_credit_note' or (r.st = 'sale' and coalesce(r.et, 'created') in ('created', 'voided')))) then
        update public.accounting_rules set tax_account_code = '24950501', updated_at = now() where id = r.id;
        perform pg_temp.c_log(v_org, 'accounting_rules', r.id::text, 'tax_account_code', r.t, '24950501');
      end if;
    end loop;
    -- f. borradores
    for r in select l.id, l.account_code from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
              where l.organization_id = v_org and l.account_code in ('414015', '2495') and e.posted is not true loop
      v_nuevo := case r.account_code when '414015' then '41401501' else '24950501' end;
      update public.journal_lines set account_code = v_nuevo where id = r.id;
      perform pg_temp.c_log(v_org, 'journal_lines', r.id::text, 'account_code', r.account_code, v_nuevo);
    end loop;

    -- g. saldo 414015 (y 2495, si lo hubiera)
    if not exists (select 1 from public.journal_entries where organization_id = v_org and fact_key = 'contador_reclasif_414015:' || v_org) then
      delete from c_lin;
      insert into c_lin (cta, s)
      select y.cta, y.s from (
        select l.account_code a, sum(l.debit - l.credit) s0 from public.journal_lines l
          join public.journal_entries e on e.id = l.journal_entry_id
         where l.organization_id = v_org and l.account_code in ('414015', '2495') and e.posted is true
         group by 1) z
      cross join lateral (values (case z.a when '414015' then '41401501' else '24950501' end, z.s0), (z.a, -z.s0)) y(cta, s);
      perform pg_temp.c_asiento(v_org, 'contador_reclasif_414015:' || v_org, '414015,2495');
    end if;

    -- h. org 140: INC en 2408
    if v_org = 140 and not exists (select 1 from public.journal_entries where organization_id = 140
                                     and fact_key = 'contador_reclasif_inc_2408:140') then
      select coalesce(sum(l.debit - l.credit), 0) into v_s from public.journal_lines l
        join public.journal_entries e on e.id = l.journal_entry_id
       where l.organization_id = 140 and l.account_code = '2408' and e.posted is true;
      if v_s <> -1600 then
        raise exception '134120: saldo 2408 org 140 = % (esperado -1600); detener y revisar con el contador', v_s;
      end if;
      delete from c_lin;
      insert into c_lin values ('2408', 1600), ('24950501', -1600);
      alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta;
      update public.chart_of_accounts set es_movimiento = true where organization_id = 140 and account_code = '2408';
      perform pg_temp.c_asiento(140, 'contador_reclasif_inc_2408:140', '2408');
      update public.chart_of_accounts set es_movimiento = false where organization_id = 140 and account_code = '2408';
      -- trg_chart_cuenta_titulo_configurada es diferido: se dispara ya para poder reactivar el trigger (ALTER TABLE
      -- no se permite con eventos de trigger pendientes) y vuelve a diferido.
      set constraints public.trg_chart_cuenta_titulo_configurada immediate;
      alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
      set constraints public.trg_chart_cuenta_titulo_configurada deferred;
    end if;

    -- i. títulos
    for r in select a.account_code, a.es_movimiento from public.chart_of_accounts a
              where a.organization_id = v_org and a.account_code in ('414015', '2495') and a.es_movimiento is not false loop
      if exists (select 1 from public.accounting_rules x where x.organization_id = v_org and x.is_active
                   and r.account_code in (x.debit_account_code, x.credit_account_code,
                                          coalesce(x.discount_account_code, ''), coalesce(x.tax_account_code, '')))
         or exists (select 1 from public.configuracion_contable x where x.organization_id = v_org and x.account_code = r.account_code)
         or exists (select 1 from public.categorias_tesoreria x where x.organization_id = v_org and x.cuenta_sugerida = r.account_code)
         or exists (select 1 from public.branch_account_mappings x where x.organization_id = v_org
                      and r.account_code in (x.base_account_code, x.sub_account_code))
         or exists (select 1 from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                     where l.organization_id = v_org and l.account_code = r.account_code and e.posted is not true)
         or coalesce((select sum(l.debit - l.credit) from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                       where l.organization_id = v_org and l.account_code = r.account_code and e.posted is true), 0) <> 0 then
        raise exception '134120: org % cuenta % sigue referenciada o con saldo; no puede pasar a título', v_org, r.account_code;
      end if;
      perform pg_temp.c_log(v_org, 'cuenta', r.account_code, 'es_movimiento', r.es_movimiento::text, 'false');
      update public.chart_of_accounts set es_movimiento = false, updated_at = now()
       where organization_id = v_org and account_code = r.account_code;
    end loop;
  end loop;
exception when others then
  alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta;
  raise;
end $$;
drop table if exists c_lin;
