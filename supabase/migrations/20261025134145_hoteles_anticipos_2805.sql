-- Commit B (comisiones/pasivos) 25-oct-2026, QA 801206c2 MEDIO-2. NO aplicada. Requiere 134110 (28050501) y 134120
-- (no-show D28050501). Sin esto el no-show debitaría 28050501 sin que el anticipo esté ahí.
--   a. Hoteles (type_id 2) con 28050501 de movimiento: reglas 'reservation' confirmed C2405/C4250/C2805 -> C28050501
--      (C4250 en 130/133/136/326) y cancelled D2405/D2805 -> D28050501. Bitácora p1_puc_bitacora migracion '134145'.
--   b. Saldo del anticipo contabilizado en 2405 por asientos source='reservation' -> 28050501, asiento
--      'hotel_anticipos_2805:<org>[:n]' fechado 2026-10-25 12:00 COT (octubre ABIERTO). En prod solo la org 2:
--      -3.200.075 (3 líneas desde 16-ene-2026). Hay que aplicarlo ANTES del primer no-show.
-- MEDIO-3 (documentado, sin cambio): 2805 sigue de MOVIMIENTO (NULL) con hijo 280505 (134110 l.92-98, trigger
--   apagado). Un UPDATE futuro de la fila 2805 con trg_puc_validar_cuenta activo la vuelve título y
--   trg_chart_cuenta_titulo_configurada mueve la clave anticipos (115 orgs) a 28050501; los flujos customer_credit
--   con 2805 fijo fallarían. No editar la fila 2805 sin apagar el trigger hasta que el contador decida.
-- Rollback: supabase/rollbacks/20261025134145_hoteles_anticipos_2805_rollback.sql
set constraints public.trg_chart_cuenta_titulo_configurada immediate;

create or replace function pg_temp.h_log(p_org integer, p_obj text, p_clave text, p_campo text, p_ant text, p_nuevo text)
returns void language sql as $$
  insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
  values ('134145', p_org, p_obj, p_clave, p_campo, p_ant, p_nuevo);
$$;

do $$
declare
  v_org integer;
  r record;
  v_s numeric;
  v_n integer;
  v_fact text;
  v_branch integer;
  v_entry integer;
begin
  for v_org in select o.id from public.organizations o where o.type_id = 2
                  and exists (select 1 from public.chart_of_accounts a where a.organization_id = o.id
                                and a.account_code = '28050501' and a.es_movimiento is not false)
                order by 1 loop
    -- a. reglas
    for r in select id, event_type et, debit_account_code d, credit_account_code c from public.accounting_rules
              where organization_id = v_org and source_type = 'reservation' and event_type in ('confirmed', 'cancelled') loop
      if r.et = 'confirmed' and r.c in ('2405', '4250', '2805') then
        update public.accounting_rules set credit_account_code = '28050501', updated_at = now() where id = r.id;
        perform pg_temp.h_log(v_org, 'accounting_rules', r.id::text, 'credit_account_code', r.c, '28050501');
      elsif r.et = 'cancelled' and r.d in ('2405', '2805') then
        update public.accounting_rules set debit_account_code = '28050501', updated_at = now() where id = r.id;
        perform pg_temp.h_log(v_org, 'accounting_rules', r.id::text, 'debit_account_code', r.d, '28050501');
      end if;
    end loop;

    -- b. saldo de anticipos de reservas en 2405
    if exists (select 1 from public.journal_entries x where x.organization_id = v_org
                 and (x.fact_key = 'hotel_anticipos_2805:' || v_org or x.fact_key like 'hotel_anticipos_2805:' || v_org || ':%')
                 and not exists (select 1 from public.journal_entries rv where rv.organization_id = v_org
                                   and rv.fact_key = 'reversal:' || x.id)) then
      continue;
    end if;
    select round(coalesce(sum(l.debit - l.credit), 0), 2) into v_s
      from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
     where e.organization_id = v_org and e.source = 'reservation' and l.account_code = '2405';
    if v_s >= 0 then
      continue;
    end if;
    if not exists (select 1 from public.fiscal_periods fp where fp.organization_id = v_org and fp.period_type = 'monthly'
                     and fp.status = 'open' and date '2026-10-25' between fp.start_date and fp.end_date) then
      raise exception '134145: org % con octubre 2026 cerrado; abrir el período antes de aplicar', v_org;
    end if;
    select count(*) into v_n from public.journal_entries x where x.organization_id = v_org
       and (x.fact_key = 'hotel_anticipos_2805:' || v_org or x.fact_key like 'hotel_anticipos_2805:' || v_org || ':%');
    v_fact := 'hotel_anticipos_2805:' || v_org || case when v_n > 0 then ':' || v_n else '' end;
    select b.id into v_branch from public.branches b where b.organization_id = v_org order by b.is_main desc nulls last, b.id limit 1;
    insert into public.journal_entries (organization_id, branch_id, entry_date, memo, posted, source, source_id, fact_key, created_at, updated_at)
    values (v_org, v_branch, '2026-10-25 12:00 America/Bogota'::timestamptz,
            'Reclasificación anticipos de reservas 2405 -> 28050501 (25-oct-2026)', true, 'reclasificacion_titulo',
            'anticipos_reservas', v_fact, now(), now())
    returning id into v_entry;
    insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, organization_id, debit_base, credit_base)
    values (v_entry, '2405', 'Anticipos de reservas a 28050501', -v_s, 0, v_org, -v_s, 0),
           (v_entry, '28050501', 'Anticipos de reservas desde 2405', 0, -v_s, v_org, 0, -v_s);
    perform pg_temp.h_log(v_org, 'journal_entries', v_entry::text, 'reclasificacion', null, v_fact);
    raise notice '134145: org % anticipos 2405 % -> 28050501 (asiento %)', v_org, v_s, v_entry;
  end loop;
end $$;

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261025134145', 'hoteles_anticipos_2805', array[]::text[], 'p1_apply_executor')
on conflict (version) do nothing;
