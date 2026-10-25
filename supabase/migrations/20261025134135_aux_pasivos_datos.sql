-- Auxiliares de pasivos del contador, paso 3 de 4: DATOS. NO aplicada. Requiere 134125 (cuentas) y 134130 (funciones).
-- Regla de oro por cuenta madre, en cada org: auxiliar ya creado (134125) → repuntar TODOS los flujos (reglas, claves,
-- categorías de tesorería, fallas abiertas, borradores) → reclasificar saldo contabilizado con asiento FECHADO
-- '2026-10-25' 12:00 COT (explícito) → solo entonces la madre (y las subcuentas que quedaron con hijos) pasa a TÍTULO.
-- Idempotente (fact_key 'aux_reclasif_2205:<org>'; los repuntes solo tocan lo que aún apunta a lo viejo).
-- Exige octubre 2026 ABIERTO en cada org con asiento. No toca organizations.
--   a. Comisiones (134095): reglas de empleado 25050501 → 25050502; de externo 23359501 → 23352001.
--      Reglas viejas D5235/C2104 (2104 = obligaciones financieras; 12 orgs): 2104 → 25050502, 5235 → 52051801.
--   b. OTA (ota_commission, 116 orgs): crédito 2335 → 23352002; débito 5235 → 52950501 (529505 ya es título).
--   c. Nómina: 2505 → 25050501 (payroll created/paid, expense «Nomina por Pagar»).
--   d. 2205 y 220505 → 22050501 (purchase, purchase_order, inventory, purchase_payment, manifest; débito o crédito).
--   e. 2335 restante → 23359501 (tipos 4/6: purchase, purchase_order, purchase_payment, manifest).
--   f. 2365 (impuesto de la regla) → 23654001.
--   g. Claves: proveedores/manifiesto_por_pagar 2205 → 22050501; nomina_por_pagar 2505 → 25050501; retefuente 2365 →
--      23654001; compra_servicio/manifiesto_transporte 2335 → 23359501; comisiones (529505/52950501/5235) → 52051801.
--   h. Categorías de tesorería 2205 → 22050501 («Proveedores y compras», «Devolución de proveedores»).
--   i. Fallas abiertas (journal_entry_failures sin resolver) con 2205/2505/2335/2365 → su auxiliar.
--   j. Borradores: 2205/220505 → 22050501; 2505 → 25050501; 2335 → 23352002 si source OTA, si no 23359501; 2365 → 23654001.
--   k. Saldo contabilizado 2026 de 2205 y 220505 CON NIT (de la línea o del documento origen) → 22050501, asiento
--      'aux_reclasif_2205:<org>', una línea por tercero (NIT) para conservar el auxiliar por proveedor (AJUSTE M1/M2).
--      2505/2335/2365: 0 líneas posteadas → no se reclasifican; si alguna tuviera saldo, ABORTA (dato a revisar).
--   l. Títulos: 2205, 220505, 2505, 250505, 2335, 233520, 233595, 2365 y sus subcuentas 2365xx que tengan hijos pasan a
--      título si quedan sin referencias, sin borradores y en saldo 0; si no, ABORTA.
-- AJUSTE 25-oct (comisiones_ajuste_retenciones_25oct.md):
--   M5. Reglas viejas de comisión SIN conditions.vinculo (5235/2370; 97 orgs en prod) → is_active = false (bitácora).
--   M1. El NIT de cada línea de 2205 sale del DOCUMENTO origen si la línea no lo trae (invoice_purchase → proveedor;
--       payments → cuenta por pagar → proveedor; documento soporte → fn_tercero_de_documento). Las líneas SIN NIT
--       resoluble (datos de prueba, sobre todo orgs 144/331) quedan FUERA de la reclasificación: no se crea un
--       «Proveedor por identificar» ni se borra/anula nada; 2205 NO pasa a título en esas orgs (queda de movimiento).
--   M2. Solo saldo 2026 (entry_date en 2026); lo anterior (org 2: 151.500 de 2025) se queda en 2205.
--   M7. ReteIVA/ReteICA (2367/2368) y anticipos 135515/135517/135518: repunte de reglas/claves/categorías/fallas/
--       borradores a 23670501/23680501/13551501/13551701/13551801; pasan a título SOLO si quedan libres y en saldo 0
--       (si no, se quedan de movimiento con aviso; 0 saldo 2026 en prod).
-- Bitácora p1_puc_bitacora migracion '134135' (valor_anterior real, NULL incluido). [DATO PROD → OK de Juan]
-- Rollback: supabase/rollbacks/20261025134135_aux_pasivos_datos_rollback.sql

create or replace function pg_temp.a_log(p_org integer, p_obj text, p_clave text, p_campo text, p_ant text, p_nuevo text)
returns void language sql as $$
  insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
  values ('134135', p_org, p_obj, p_clave, p_campo, p_ant, p_nuevo);
$$;

-- Repunta una columna de accounting_rules en una org, con bitácora.
create or replace function pg_temp.a_regla(p_org integer, p_col text, p_de text[], p_a text, p_filtro text default 'true')
returns integer language plpgsql as $$
declare r record; n integer := 0;
begin
  for r in execute format('select id, %I::text v from public.accounting_rules where organization_id = $1 and %I = any($2) and (%s)',
                          p_col, p_col, p_filtro) using p_org, p_de loop
    execute format('update public.accounting_rules set %I = $1, updated_at = now() where id = $2', p_col) using p_a, r.id;
    perform pg_temp.a_log(p_org, 'accounting_rules', r.id::text, p_col, r.v, p_a);
    n := n + 1;
  end loop;
  return n;
end $$;

create or replace function pg_temp.a_asiento(p_org integer, p_fact text, p_source_id text)
returns integer language plpgsql as $$
declare v_branch integer; v_entry integer;
begin
  if not exists (select 1 from a_lin where round(s, 2) <> 0) then return null; end if;
  if (select round(sum(s), 2) from a_lin) <> 0 then
    raise exception '134135: asiento % org % no cuadra', p_fact, p_org;
  end if;
  if not exists (select 1 from public.fiscal_periods fp where fp.organization_id = p_org and fp.period_type = 'monthly'
                   and fp.status = 'open' and date '2026-10-25' between fp.start_date and fp.end_date) then
    raise exception '134135: org % con octubre 2026 cerrado; abrir el período antes de aplicar', p_org;
  end if;
  select b.id into v_branch from public.branches b where b.organization_id = p_org order by b.is_main desc nulls last, b.id limit 1;
  insert into public.journal_entries (organization_id, branch_id, entry_date, memo, posted, source, source_id, fact_key, created_at, updated_at)
  values (p_org, v_branch, '2026-10-25 12:00 America/Bogota'::timestamptz, 'Reclasificación auxiliares del contador 25-oct-2026',
          true, 'reclasificacion_titulo', p_source_id, p_fact, now(), now())
  returning id into v_entry;
  insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit, organization_id,
                                    debit_base, credit_base, tercero_nit, tercero_nombre)
  select v_entry, a.cta, 'Reclasificación auxiliares del contador 25-oct-2026 (' || p_source_id || ')',
         greatest(round(a.s, 2), 0), greatest(-round(a.s, 2), 0), p_org, greatest(round(a.s, 2), 0), greatest(-round(a.s, 2), 0),
         a.nit, a.nombre
    from a_lin a where round(a.s, 2) <> 0;
  perform pg_temp.a_log(p_org, 'journal_entries', v_entry::text, 'reclasificacion', null, p_fact);
  return v_entry;
end $$;

-- AJUSTE (M1): NIT del documento origen de una línea de 2205 (null si no se puede identificar). No usa el
-- «consumidor final» como respaldo: un proveedor sin NIT queda sin identificar.
create or replace function pg_temp.a_nit_doc(p_source text, p_source_id text, out nit text, out nombre text)
returns record language plpgsql stable as $$
begin
  if p_source in ('invoice_purchase', 'purchase') then
    select coalesce(nullif(btrim(s.nit), ''), nullif(btrim(s.tax_id), '')), nullif(btrim(s.name), '') into nit, nombre
      from public.invoice_purchase i join public.suppliers s on s.id = i.supplier_id where i.id::text = p_source_id;
  elsif p_source in ('payments', 'purchase_payment') then
    select coalesce(nullif(btrim(s.nit), ''), nullif(btrim(s.tax_id), '')), nullif(btrim(s.name), '') into nit, nombre
      from public.payments p
      left join public.accounts_payable ap on ap.id::text = p.source_id::text
      left join public.invoice_purchase i on i.id::text = coalesce(ap.invoice_id::text, p.source_id::text)
      join public.suppliers s on s.id = coalesce(ap.supplier_id, i.supplier_id)
     where p.id::text = p_source_id;
  elsif p_source in ('support_document', 'support_documents', 'documento_soporte') and p_source_id ~ '^[0-9a-f-]{36}$' then
    select t.nit, t.nombre into nit, nombre from public.fn_tercero_de_documento('documento_soporte', p_source_id::uuid) t;
  end if;
  if nit is null then nombre := null; end if;
end $$;

drop table if exists a_lin;
create temp table a_lin (cta text, s numeric, nit text, nombre text);

do $$
declare
  v_org integer;
  r record;
  v_nuevo text;
  v_s numeric;
  v_fact text;
  v_n integer;
  v_madres constant text[] := array['2205', '220505', '2505', '250505', '2335', '233520', '233595', '2365',
                                    '236505', '236515', '236520', '236525', '236530', '236540',
                                    '2367', '236705', '2368', '236805', '135515', '135517', '135518'];
  -- AJUSTE: estas madres NO abortan si quedan con saldo/referencias: se quedan de movimiento con aviso.
  --   2205/220505: saldo previo a 2026 o líneas sin NIT (M1/M2). 2367/2368/1355xx: posibles referencias no previstas.
  v_suaves constant text[] := array['2205', '220505', '2367', '236705', '2368', '236805', '135515', '135517', '135518'];
begin
  for v_org in select o.id from public.organizations o order by 1 loop
    -- solo orgs con los auxiliares que van a recibir algo
    continue when not exists (select 1 from public.chart_of_accounts a where a.organization_id = v_org
                                and a.account_code in ('22050501', '25050501', '23359501', '23654001'));

    -- a0. AJUSTE (M5): reglas de comisión sin vínculo (5235/2370 viejas) → inactivas; ya no son respaldo silencioso.
    for r in select id from public.accounting_rules
              where organization_id = v_org and source_type = 'commission' and is_active
                and coalesce(conditions->>'vinculo', '') = '' loop
      update public.accounting_rules set is_active = false, updated_at = now() where id = r.id;
      perform pg_temp.a_log(v_org, 'accounting_rules', r.id::text, 'is_active', 'true', 'false');
    end loop;

    -- a. comisiones
    perform pg_temp.a_regla(v_org, 'credit_account_code', array['25050501'], '25050502',
      $f$source_type = 'commission' and conditions->>'vinculo' = 'empleado'$f$);
    perform pg_temp.a_regla(v_org, 'debit_account_code', array['25050501'], '25050502',
      $f$source_type = 'commission' and conditions->>'vinculo' = 'empleado'$f$);
    perform pg_temp.a_regla(v_org, 'credit_account_code', array['23359501'], '23352001',
      $f$source_type = 'commission' and conditions->>'vinculo' = 'externo'$f$);
    perform pg_temp.a_regla(v_org, 'debit_account_code', array['23359501'], '23352001',
      $f$source_type = 'commission' and conditions->>'vinculo' = 'externo'$f$);
    if exists (select 1 from public.chart_of_accounts where organization_id = v_org and account_code = '52051801') then
      perform pg_temp.a_regla(v_org, 'debit_account_code', array['5235'], '52051801',
        $f$source_type = 'commission' and '2104' in (debit_account_code, credit_account_code)$f$);
    end if;
    perform pg_temp.a_regla(v_org, 'credit_account_code', array['2104'], '25050502', $f$source_type = 'commission'$f$);
    perform pg_temp.a_regla(v_org, 'debit_account_code', array['2104'], '25050502', $f$source_type = 'commission'$f$);

    -- b. OTA
    perform pg_temp.a_regla(v_org, 'credit_account_code', array['2335'], '23352002', $f$source_type = 'ota_commission'$f$);
    if exists (select 1 from public.chart_of_accounts where organization_id = v_org and account_code = '52950501') then
      perform pg_temp.a_regla(v_org, 'debit_account_code', array['5235'], '52950501', $f$source_type = 'ota_commission'$f$);
    end if;

    -- c-f. resto de reglas
    perform pg_temp.a_regla(v_org, 'debit_account_code',  array['2505'], '25050501');
    perform pg_temp.a_regla(v_org, 'credit_account_code', array['2505'], '25050501');
    perform pg_temp.a_regla(v_org, 'debit_account_code',  array['2205', '220505'], '22050501');
    perform pg_temp.a_regla(v_org, 'credit_account_code', array['2205', '220505'], '22050501');
    perform pg_temp.a_regla(v_org, 'debit_account_code',  array['2335'], '23359501');
    perform pg_temp.a_regla(v_org, 'credit_account_code', array['2335'], '23359501');
    perform pg_temp.a_regla(v_org, 'tax_account_code',    array['2365'], '23654001');
    -- AJUSTE (M7): reteIVA/reteICA y anticipos de impuestos a su auxiliar (solo si el auxiliar existe).
    for r in select * from (values ('2367', '23670501'), ('2368', '23680501'), ('135515', '13551501'),
                                   ('135517', '13551701'), ('135518', '13551801')) t(de, a) loop
      continue when not exists (select 1 from public.chart_of_accounts c where c.organization_id = v_org and c.account_code = r.a);
      perform pg_temp.a_regla(v_org, 'debit_account_code',  array[r.de], r.a);
      perform pg_temp.a_regla(v_org, 'credit_account_code', array[r.de], r.a);
      perform pg_temp.a_regla(v_org, 'tax_account_code',    array[r.de], r.a);
    end loop;

    -- g. claves
    for r in select id, clave, account_code from public.configuracion_contable
              where organization_id = v_org
                and (account_code in ('2205', '220505', '2505', '2365', '2335', '2367', '2368', '135515', '135517', '135518')
                     or (clave = 'comisiones' and account_code in ('529505', '52950501', '5235'))) loop
      v_nuevo := case
        when r.clave = 'comisiones' then '52051801'
        when r.account_code = '2367' then '23670501'
        when r.account_code = '2368' then '23680501'
        when r.account_code like '1355%' then r.account_code || '01'
        when r.account_code in ('2205', '220505') then '22050501'
        when r.account_code = '2505' then '25050501'
        when r.account_code = '2365' then '23654001'
        else '23359501' end;
      continue when not exists (select 1 from public.chart_of_accounts a where a.organization_id = v_org and a.account_code = v_nuevo);
      update public.configuracion_contable set account_code = v_nuevo where id = r.id;
      perform pg_temp.a_log(v_org, 'configuracion_contable', r.id::text, r.clave, r.account_code, v_nuevo);
    end loop;

    -- h. categorías de tesorería
    for r in select id, cuenta_sugerida c from public.categorias_tesoreria
              where organization_id = v_org and cuenta_sugerida in ('2205', '220505', '2505', '2335', '2365', '2367', '2368') loop
      v_nuevo := case r.c when '2505' then '25050501' when '2335' then '23359501' when '2365' then '23654001'
                          when '2367' then '23670501' when '2368' then '23680501' else '22050501' end;
      continue when not exists (select 1 from public.chart_of_accounts a where a.organization_id = v_org and a.account_code = v_nuevo);
      update public.categorias_tesoreria set cuenta_sugerida = v_nuevo where id = r.id;
      perform pg_temp.a_log(v_org, 'categorias_tesoreria', r.id::text, 'cuenta_sugerida', r.c, v_nuevo);
    end loop;

    -- i. fallas abiertas
    for r in select id, debit_account d, credit_account c from public.journal_entry_failures
              where organization_id = v_org and resolved_at is null
                and (debit_account in ('2205', '220505', '2505', '2335', '2365') or credit_account in ('2205', '220505', '2505', '2335', '2365')) loop
      update public.journal_entry_failures
         set debit_account = case when r.d in ('2205', '220505') then '22050501' when r.d = '2505' then '25050501'
                                  when r.d = '2335' then '23359501' when r.d = '2365' then '23654001' else r.d end,
             credit_account = case when r.c in ('2205', '220505') then '22050501' when r.c = '2505' then '25050501'
                                   when r.c = '2335' then '23359501' when r.c = '2365' then '23654001' else r.c end
       where id = r.id;
      perform pg_temp.a_log(v_org, 'journal_entry_failures', r.id::text, 'cuentas', coalesce(r.d, '') || '|' || coalesce(r.c, ''), null);
    end loop;

    -- j. borradores
    for r in select l.id, l.account_code a, e.source from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
              where l.organization_id = v_org and e.posted is not true
                and l.account_code in ('2205', '220505', '2505', '2335', '2365') loop
      v_nuevo := case
        when r.a in ('2205', '220505') then '22050501'
        when r.a = '2505' then '25050501'
        when r.a = '2365' then '23654001'
        when r.source in ('ota_payout', 'ota_commission') then '23352002'
        else '23359501' end;
      update public.journal_lines set account_code = v_nuevo where id = r.id;
      perform pg_temp.a_log(v_org, 'journal_lines', r.id::text, 'account_code', r.a, v_nuevo);
    end loop;

    -- k. saldo contabilizado
    if exists (select 1 from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                where l.organization_id = v_org and e.posted is true
                  and l.account_code in ('2505', '250505', '2335', '233520', '233595', '2365')
                group by l.account_code having round(sum(l.debit - l.credit), 2) <> 0) then
      raise exception '134135: org % tiene saldo contabilizado en 2505/2335/2365 (se esperaba 0); detener y revisar con el contador', v_org;
    end if;
    -- Idempotente: se salta si hay una reclasificación VIGENTE (no revertida). Tras un rollback (contraasiento) la
    -- re-aplicación usa 'aux_reclasif_2205:<org>:<n>' (fact_key es único por org).
    v_fact := 'aux_reclasif_2205:' || v_org;
    select count(*) into v_n from public.journal_entries x
     where x.organization_id = v_org and (x.fact_key = v_fact or x.fact_key like v_fact || ':%');
    if v_n > 0 then v_fact := v_fact || ':' || (v_n + 1); end if;
    if not exists (select 1 from public.journal_entries x where x.organization_id = v_org
                     and (x.fact_key = 'aux_reclasif_2205:' || v_org or x.fact_key like 'aux_reclasif_2205:' || v_org || ':%')
                     and not exists (select 1 from public.journal_entries rv where rv.organization_id = v_org
                                       and rv.fact_key = 'reversal:' || x.id)) then
      delete from a_lin;
      insert into a_lin (cta, s, nit, nombre)
      select y.cta, y.s, z.nit, z.nombre from (
        select w.a, w.nit, max(w.nombre) nombre, sum(w.s) s0
          from (select l.account_code a, coalesce(nullif(btrim(l.tercero_nit), ''), d.nit) nit,
                       case when nullif(btrim(l.tercero_nit), '') is not null then l.tercero_nombre else d.nombre end nombre,
                       l.debit - l.credit s
                  from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
                  left join lateral pg_temp.a_nit_doc(e.source, e.source_id) d on nullif(btrim(l.tercero_nit), '') is null
                 where l.organization_id = v_org and l.account_code in ('2205', '220505') and e.posted is true
                   and e.entry_date >= '2026-01-01 00:00 America/Bogota'::timestamptz
                   and e.entry_date <  '2027-01-01 00:00 America/Bogota'::timestamptz
                   -- reclasificaciones anteriores ya revertidas y sus contraasientos (netean 0; la reversa no trae NIT)
                   and coalesce(e.fact_key, '') not like 'aux_reclasif_2205:%'
                   and not exists (select 1 from public.journal_entries o where o.organization_id = v_org
                                     and e.fact_key = 'reversal:' || o.id and o.fact_key like 'aux_reclasif_2205:%')) w
         where w.nit is not null          -- M1: sin NIT resoluble → fuera (se reporta, no se inventa tercero)
         group by w.a, w.nit) z
      cross join lateral (values ('22050501', z.s0), (z.a, -z.s0)) y(cta, s);
      if exists (select 1 from a_lin where cta in ('2205', '220505') and round(s, 2) <> 0) then
        -- las madres reciben la línea mientras siguen de movimiento (134125 no las cambió)
        perform pg_temp.a_asiento(v_org, v_fact, '2205');
      end if;
    end if;

    -- l. títulos
    for r in select a.account_code, a.es_movimiento from public.chart_of_accounts a
              where a.organization_id = v_org and a.account_code = any (v_madres) and a.es_movimiento is not false
                and exists (select 1 from public.chart_of_accounts h where h.organization_id = v_org and h.parent_code = a.account_code)
              order by length(a.account_code) desc loop
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
        if r.account_code = any (v_suaves) then
          raise notice '134135: org % cuenta % queda de MOVIMIENTO (saldo sin NIT/anterior a 2026 o referencias); no pasa a título',
            v_org, r.account_code;
          continue;
        end if;
        raise exception '134135: org % cuenta % sigue referenciada o con saldo; no puede pasar a título', v_org, r.account_code;
      end if;
      perform pg_temp.a_log(v_org, 'cuenta', r.account_code, 'es_movimiento', r.es_movimiento::text, 'false');
      update public.chart_of_accounts set es_movimiento = false, updated_at = now()
       where organization_id = v_org and account_code = r.account_code;
    end loop;
  end loop;
end $$;
drop table if exists a_lin;

insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
values ('20261025134135', 'aux_pasivos_datos', array[]::text[], 'p1_apply_executor')
on conflict (version) do nothing;
