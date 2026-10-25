-- P1 (25-oct-2026): regla del contador «nunca dejar saldo colgado». NO aplicada.
-- Paso final. Requiere 134010, 134020, 134030 (funciones sin cuentas fijas), 134040 y 134050 aplicadas. Validado por el contador el 25-oct con estos cambios:
--   * NO se reescriben asientos publicados. Por cada org se genera UN asiento nuevo publicado
--     «Reclasificación a auxiliar de movimiento», fecha de hoy; si el período de hoy está cerrado va al
--     primer período ABIERTO posterior (nunca a uno cerrado; si no hay ninguno abierto la org se salta).
--     El saldo sale de la cuenta de título y entra al auxiliar.
--   * Los borradores sí se repuntan directamente al auxiliar.
--   * Destinos: 3705 -> 37050502 | 6135 -> 61350501 (hotel/restaurante con líneas en 6135: revisión, no se titula) | 530515 -> 53051501 | 5395 -> 53959501
--     4295 -> 42959501 si la línea es de sobrantes (asiento de ajuste/movimiento de inventario);
--             si no se puede determinar -> 42959502
--     240805 -> 24080501/24080502 y 240810 -> 24081001/24081002 según la tarifa de la línea; las líneas
--             no traen tarifa (verificado al 25-oct) => auxiliar 19% y queda marcada para revisión
--             (p1_puc_bitacora.objeto = 'revision_iva').
--   * Recién después el padre pasa a título. Si al padre aún lo usa una regla, una clave o el código fijo de
--     una función viva (control previo sobre pg_proc), NO se titula (aviso).
--   * Fecha del asiento: mediodía hora Colombia del día elegido (no medianoche UTC = día anterior en COT).
--   * Idempotente: ignora asientos previos revertidos (rollback) y crea uno nuevo con fact_key ':rN'.
-- Esperado al 25-oct (solo lectura): 7 asientos de reclasificación (uno por org: 2, 113, 140, 142, 144, 199, 331):
--   2 (240810: 382.394,96), 113 (240810: 15,97), 140 (6135: 2.300; 4295: -500; 240805: -1.718*; 240810: 684),
--   142 (4295: -2.739), 144 (6135: 717.171,37; 4295: -21.000; 240810: 0,10), 199 (6135: 3.782;
--   4295: -42.900; 240805: -2.954), 331 (240810: 3.800.000)  (* saldo neto de 240805 publicado en 140)
--   Todos los 4295 publicados vienen de inventory_adjustment => 42959501. Los borradores 4295 son
--   manuales => 42959502. Org 149: 240810 no se toca (queda de movimiento con 19.000).
--   Títulos: 3705: 19 | 6135: 108 | 4295: 116 | 530515: 116 | 5395: 116 | 240805: 115 | 240810: 115
-- Rollback: supabase/rollbacks/20261025134060_p1_reclasificar_y_titular_rollback.sql

-- Destino de una línea de la cuenta padre.
create or replace function pg_temp.p1_destino(p_padre text, p_source text) returns text
language sql immutable as $$
  select case p_padre
    when '3705'   then '37050502'
    when '6135'   then '61350501'
    when '530515' then '53051501'
    when '5395'   then '53959501'
    when '4295'   then case when coalesce(p_source, '') in ('inventory_adjustment', 'inventory_adjustments', 'stock_movements')
                            then '42959501' else '42959502' end
    when '240805' then '24080501'   -- sin tarifa en la línea => 19% + revisión
    when '240810' then '24081001'
  end
$$;

do $$
declare
  v_org integer;
  r record;
  v_fecha date;
  v_entry integer;
  v_branch integer;
  v_n integer;
  v_tit integer := 0;
  v_rec integer := 0;
  v_padres text[] := array['3705','6135','4295','530515','5395','240805','240810'];
  v_ok text[];
  v_bloq text[];
  v_previos integer;
  v_creado boolean;
  f record;
begin
  -- Control previo (QA 25-oct): ninguna función viva puede seguir con el código fijo de un padre que se
  -- titula. Se ignoran los argumentos del resolver fn_cuenta_auxiliar_de_titulo(...) y los comentarios.
  -- Lista blanca: funciones revisadas en 134030 donde el literal solo compara, clasifica, nombra o es la
  -- entrada del resolver (no asigna ni postea).
  v_bloq := '{}';
  for f in
    select p.proname, array_agg(distinct m[1]) as codigos
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
     cross join lateral regexp_matches(
             regexp_replace(
               regexp_replace(p.prosrc, 'fn_cuenta_auxiliar_de_titulo\((?:[^()]|\([^()]*\))*\)', '', 'g'),
               '--[^\n]*', '', 'g'),
             '''(6135|4295|530515|5395|240805|240810)''', 'g') m
     where p.proname <> all (array[
             'fn_cuenta_auxiliar_de_titulo', 'fn_cuenta_ingresos_diversos', 'fn_clave_cuenta_configurable',
             'fn_puc_nombres_oficiales', 'fn_puc_proponer_config', 'fn_puc_proponer_lado',
             'fn_create_branch_subaccounts', 'fn_create_default_accounting_rules',
             'fn_sembrar_configuracion_contable', 'fn_sembrar_categorias_tesoreria',
             'fn_correccion_flujo_borradores', 'fn_sobrante_borradores'])
     group by p.proname
  loop
    raise notice '134060: la función % sigue con código fijo %; esos padres NO se titulan', f.proname, f.codigos;
    v_bloq := v_bloq || f.codigos;
  end loop;
  -- 3705 se titula aunque aparezca (solo lo nombra fn_puc_nombres_oficiales y no tiene movimientos).

  for v_org in
    select distinct organization_id from public.accounting_rules
     where source_type = 'inventory' and event_type = 'opening' order by 1
  loop
    -- Padres titulables en esta org: de movimiento, con hijos, sin reglas/claves que los usen.
    select coalesce(array_agg(c.account_code), '{}') into v_ok
      from public.chart_of_accounts c
     where c.organization_id = v_org and c.account_code = any (v_padres) and c.es_movimiento is true
       and exists (select 1 from public.chart_of_accounts h where h.organization_id = v_org and h.parent_code = c.account_code)
       and not exists (select 1 from public.accounting_rules ar where ar.organization_id = v_org and ar.is_active
                         and c.account_code in (ar.debit_account_code, ar.credit_account_code, ar.tax_account_code))
       and not exists (select 1 from public.configuracion_contable cc
                        where cc.organization_id = v_org and cc.account_code = c.account_code);
    for r in select unnest(v_padres) p except select unnest(v_ok) loop
      if exists (select 1 from public.chart_of_accounts c where c.organization_id = v_org and c.account_code = r.p
                   and c.es_movimiento is true
                   and exists (select 1 from public.chart_of_accounts h where h.organization_id = v_org and h.parent_code = r.p)) then
        raise notice '134060: org % cuenta % sigue en una regla/clave; NO se titula', v_org, r.p;
      end if;
    end loop;
    v_ok := array(select unnest(v_ok) except select unnest(v_bloq));
    -- Hoteles y restaurantes (type_id 1/2, regla del contador): su costo va a 6140/61400501 y nunca debió
    -- estar en 6135. Un saldo o borrador en 6135 es ambiguo (¿costo de A&B o reventa?): NO se reclasifica a
    -- 61350501 ni se fuerza a 61400501; 6135 no se titula y queda para revisión del contador.
    if '6135' = any (v_ok)
       and exists (select 1 from public.organizations o where o.id = v_org and o.type_id in (1, 2))
       and exists (select 1 from public.journal_lines l where l.organization_id = v_org and l.account_code = '6135') then
      raise notice '134060: org % (hotel/restaurante) con líneas en 6135; revisión del contador, NO se titula ni reclasifica', v_org;
      insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
      select '134060', v_org, 'revision_costo_sector', '6135', 'saldo_publicado',
             coalesce(sum(l.debit - l.credit) filter (where e.posted), 0)::text, '61400501?'
        from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
       where l.organization_id = v_org and l.account_code = '6135';
      v_ok := array_remove(v_ok, '6135');
    end if;
    continue when cardinality(v_ok) = 0;
    v_creado := false;

    -- Saldos publicados por destino (agrupado por la cuenta auxiliar que corresponde a cada línea).
    create temp table if not exists p1_saldos (padre text, aux text, saldo numeric) on commit drop;
    truncate p1_saldos;
    insert into p1_saldos
    select l.account_code, pg_temp.p1_destino(l.account_code, e.source), sum(l.debit - l.credit)
      from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id and e.posted
     where l.organization_id = v_org and l.account_code = any (v_ok)
     group by 1, 2 having sum(l.debit - l.credit) <> 0;

    -- Auxiliares destino deben existir y ser de movimiento; si no, ese padre no se titula.
    for r in select distinct s.padre, s.aux from p1_saldos s
              where not exists (select 1 from public.chart_of_accounts a where a.organization_id = v_org
                                  and a.account_code = s.aux and a.es_movimiento is true) loop
      raise notice '134060: org % saldo de % sin auxiliar %; NO se titula', v_org, r.padre, r.aux;
      v_ok := array_remove(v_ok, r.padre);
      delete from p1_saldos where padre = r.padre;
    end loop;

    -- Idempotencia: solo cuenta un asiento previo de reclasificación que NO esté revertido
    -- (el rollback crea 'reversal:<id>'). Si se reaplica tras un rollback, se crea uno nuevo.
    select count(*) into v_previos from public.journal_entries e
     where e.organization_id = v_org and e.fact_key like 'p1_reclasif_auxiliar%';
    if exists (select 1 from p1_saldos)
       and not exists (select 1 from public.journal_entries e
                        where e.organization_id = v_org and e.fact_key like 'p1_reclasif_auxiliar%'
                          and not exists (select 1 from public.journal_entries rv
                                           where rv.organization_id = v_org
                                             and rv.fact_key = 'reversal:' || e.id::text)) then
      -- Fecha: hoy si su período mensual está abierto; si no, inicio del primer período abierto posterior.
      select case
               when exists (select 1 from public.fiscal_periods fp where fp.organization_id = v_org
                              and fp.period_type = 'monthly' and fp.status = 'open'
                              and current_date between fp.start_date and fp.end_date)
                 then current_date
               else (select min(fp.start_date) from public.fiscal_periods fp where fp.organization_id = v_org
                        and fp.period_type = 'monthly' and fp.status = 'open' and fp.start_date > current_date)
             end into v_fecha;
      if v_fecha is null then
        raise notice '134060: org % sin período abierto para la reclasificación; se salta la org', v_org;
        continue;
      end if;

      select b.id into v_branch from public.branches b
       where b.organization_id = v_org order by b.is_main desc nulls last, b.id limit 1;
      insert into public.journal_entries (organization_id, branch_id, entry_date, memo, posted, source,
                                          source_id, fact_key, created_at, updated_at)
      values (v_org, v_branch, (v_fecha::text || ' 12:00 America/Bogota')::timestamptz, 'Reclasificación a auxiliar de movimiento',
              true, 'reclasificacion_titulo', array_to_string(v_ok, ','),
              'p1_reclasif_auxiliar' || case when v_previos > 0 then ':r' || v_previos::text else '' end, now(), now())
      returning id into v_entry;

      -- Entra al auxiliar (mismo signo del saldo) y sale de la cuenta de título (signo contrario).
      insert into public.journal_lines (journal_entry_id, account_code, description, debit, credit,
                                        organization_id, debit_base, credit_base)
      select v_entry, x.cta, x.descr, greatest(x.s, 0), greatest(-x.s, 0), v_org, greatest(x.s, 0), greatest(-x.s, 0)
        from (select s.aux as cta, 'Reclasificación a auxiliar de movimiento (desde ' || s.padre || ')'
                     || case when s.padre like '2408%' then ' — tarifa no determinada: 19%, REVISAR' else '' end as descr,
                     s.saldo as s
                from p1_saldos s
              union all
              select s.padre, 'Reclasificación a auxiliar de movimiento (hacia ' || s.aux || ')', -s.saldo
                from p1_saldos s) x;

      insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
      select '134060', v_org, 'asiento_reclasif', v_entry::text, s.padre, s.saldo::text, s.aux from p1_saldos s;
      insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
      select '134060', v_org, 'revision_iva', v_entry::text, s.padre, s.saldo::text, s.aux
        from p1_saldos s where s.padre like '2408%';
      v_rec := v_rec + 1;
      v_creado := true;
    end if;

    -- Saldo sin asiento de reclasificación (no debería pasar): ese padre NO se titula.
    if not v_creado then
      for r in select distinct s.padre from p1_saldos s loop
        raise notice '134060: org % cuenta % con saldo y sin asiento de reclasificación; NO se titula', v_org, r.padre;
        v_ok := array_remove(v_ok, r.padre);
      end loop;
    end if;

    -- Borradores: se repuntan directamente al auxiliar destino.
    with obj as (
      select l.id, l.account_code as padre, pg_temp.p1_destino(l.account_code, e.source) as aux
        from public.journal_lines l join public.journal_entries e on e.id = l.journal_entry_id
       where l.organization_id = v_org and l.account_code = any (v_ok) and not e.posted
         and exists (select 1 from public.chart_of_accounts a where a.organization_id = v_org
                       and a.account_code = pg_temp.p1_destino(l.account_code, e.source) and a.es_movimiento is true)
    ), log as (
      insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
      select '134060', v_org, case when padre like '2408%' then 'linea_borrador_revision_iva' else 'linea_borrador' end,
             id::text, 'account_code', padre, aux from obj
    )
    update public.journal_lines l set account_code = obj.aux, updated_at = now() from obj where l.id = obj.id;

    -- Si quedó algún borrador sin destino, ese padre no se titula.
    for r in select distinct l.account_code p from public.journal_lines l
              join public.journal_entries e on e.id = l.journal_entry_id
             where l.organization_id = v_org and l.account_code = any (v_ok) and not e.posted loop
      raise notice '134060: org % cuenta % conserva borradores sin auxiliar destino; NO se titula', v_org, r.p;
      v_ok := array_remove(v_ok, r.p);
    end loop;

    with t as (
      update public.chart_of_accounts set es_movimiento = false, updated_at = now()
       where organization_id = v_org and account_code = any (v_ok) and es_movimiento is true
      returning account_code
    )
    insert into public.p1_puc_bitacora (migracion, organization_id, objeto, clave, campo, valor_anterior, valor_nuevo)
    select '134060', v_org, 'titulo', account_code, 'es_movimiento', 'true', 'false' from t;
    get diagnostics v_n = row_count;
    v_tit := v_tit + v_n;
  end loop;
  raise notice '134060: % asientos de reclasificación (esperado 7), % cuentas pasadas a título', v_rec, v_tit;
end $$;
