-- P1 (25-oct-2026): reproceso de los asientos de inventario que fallaron con cuenta_no_configurada.
-- NO SE EJECUTA AL APLICAR: solo crea funciones. Correr con OK de Juan, primero en una org de prueba,
-- luego solo 345, 346 y 199:  select public.fn_reprocesar_fallos_stock(345);  (repetir hasta pendientes = 0)
-- Requiere aplicada antes 20261025130000_p1_cuenta_sede_resuelve_auxiliar.
-- fn_asiento_stock_movement es la MISMA lógica de fn_auto_journal_stock_movement (viva al 25-oct)
-- sobre una fila ya insertada; el trigger no se modifica.
-- Rollback: supabase/rollbacks/20261025130200_p1_reprocesar_fallos_stock_rollback.sql

CREATE OR REPLACE FUNCTION public.fn_asiento_stock_movement(p_sm public.stock_movements, OUT entry_id integer, OUT fallo text, OUT ya_existia boolean)
 RETURNS record
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_amount numeric;
  v_unit_cost numeric;
  v_description text;
  v_product_name text;
  v_debit_account text;
  v_credit_account text;
  v_debito_base text;
  v_credito_base text;
  v_evento text;
  v_fallo text;
  v_fact_key text;
begin
  ya_existia := false;
  if p_sm.source in ('purchase', 'purchase_order', 'purchase_invoice', 'purchase_void',
                    'transfer', 'transfer_out', 'transfer_in') then
    fallo := 'no_aplica';
    return;
  end if;

  if p_sm.source in ('return', 'credit_note', 'invoice_void', 'production') then
    fallo := 'no_aplica';
    return;
  end if;

  if p_sm.source = 'adjustment' and p_sm.source_id ~ '^[0-9]{1,9}$' and exists (
    select 1
      from public.inventory_adjustments ia
     where ia.id = p_sm.source_id::integer
       and ia.organization_id = p_sm.organization_id
       and ia.type in ('gain', 'loss')
  ) then
    fallo := 'no_aplica';
    return;
  end if;

  if p_sm.direction not in ('out', 'in') then
    fallo := 'no_aplica';
    return;
  end if;

  v_unit_cost := coalesce(p_sm.unit_cost, 0);
  if v_unit_cost = 0 then
    select sl.avg_cost
      into v_unit_cost
      from public.stock_levels sl
     where sl.product_id = p_sm.product_id
       and sl.branch_id = p_sm.branch_id
     limit 1;
  end if;

  v_amount := abs(p_sm.qty) * coalesce(v_unit_cost, 0);
  if v_amount <= 0 then
    fallo := 'no_aplica';
    return;
  end if;

  v_fact_key := 'stock_movement:' || p_sm.id::text;

  select je.id into entry_id
    from public.journal_entries je
   where je.organization_id = p_sm.organization_id
     and (
       je.fact_key = v_fact_key
       or (je.source = 'stock_movements' and je.source_id = p_sm.id::text)
     )
   order by je.id
   limit 1;
  if entry_id is not null then
    ya_existia := true;
    return;
  end if;

  select c.debito, c.credito, c.evento
    into v_debito_base, v_credito_base, v_evento
    from public.fn_cuentas_movimiento_stock(p_sm.organization_id, p_sm.source, p_sm.direction) c;

  if v_debito_base is null or v_credito_base is null then
    perform public.fn_log_journal_failure(
      p_sm.organization_id, p_sm.branch_id, coalesce(p_sm.created_at, now()),
      'stock_movements', p_sm.id::text, v_fact_key, v_debito_base, v_credito_base, v_amount,
      'no_rule', 'Sin cuentas para el movimiento ' || coalesce(p_sm.source, '') || ' ' || coalesce(p_sm.direction, ''));
    fallo := 'no_rule';
    return;
  end if;

  select r.cuenta, r.fallo
    into v_debit_account, v_fallo
    from public.fn_cuenta_configurada_de_sede(
      p_sm.organization_id, p_sm.branch_id, 'stock_movements', 'debito', v_debito_base
    ) r;
  if v_fallo is not null then
    perform public.fn_log_journal_failure(
      p_sm.organization_id, p_sm.branch_id, coalesce(p_sm.created_at, now()),
      'stock_movements', p_sm.id::text, v_fact_key, v_debit_account, v_credito_base, v_amount,
      'cuenta_no_configurada', v_fallo);
    fallo := v_fallo;
    return;
  end if;

  select r.cuenta, r.fallo
    into v_credit_account, v_fallo
    from public.fn_cuenta_configurada_de_sede(
      p_sm.organization_id, p_sm.branch_id, 'stock_movements', 'credito', v_credito_base
    ) r;
  if v_fallo is not null then
    perform public.fn_log_journal_failure(
      p_sm.organization_id, p_sm.branch_id, coalesce(p_sm.created_at, now()),
      'stock_movements', p_sm.id::text, v_fact_key, v_debit_account, v_credit_account, v_amount,
      'cuenta_no_configurada', v_fallo);
    fallo := v_fallo;
    return;
  end if;

  select p.name
    into v_product_name
    from public.products p
   where p.id = p_sm.product_id
     and not exists (
       select 1 from public.products pp_elim
        where pp_elim.id = p.parent_product_id
          and pp_elim.status = 'deleted'
     )
   limit 1;

  v_description := case v_evento
    when 'opening' then 'Apertura de inventario - '
    when 'sale' then 'Costo de venta - '
    when 'return' then 'Devolución de inventario - '
    when 'loss' then 'Ajuste de inventario (pérdida) - '
    when 'purchase' then 'Compra de inventario - '
    else 'Ajuste de inventario (ganancia) - '
  end || coalesce(v_product_name, 'Prod:' || p_sm.product_id);

  if p_sm.direction = 'in'
     and v_evento is distinct from 'return'
     and left(coalesce(v_credit_account, ''), 1) = '6' then
    v_credit_account := coalesce(
      public.fn_primera_cuenta_detalle(p_sm.organization_id, array['4295', '4210']),
      v_credit_account
    );
    if left(coalesce(v_credit_account, ''), 1) = '6' then
      perform public.fn_log_journal_failure(
        p_sm.organization_id, p_sm.branch_id, coalesce(p_sm.created_at, now()),
        'stock_movements', p_sm.id::text, v_fact_key, v_debit_account, v_credit_account, v_amount,
        'entrada_clase_6', 'Una entrada que no es devolución no acredita la clase 6');
      fallo := 'entrada_clase_6';
      return;
    end if;
  end if;

  begin
    entry_id := public.fn_create_journal_entry(
      p_sm.organization_id,
      p_sm.branch_id,
      coalesce(p_sm.created_at, now()),
      v_description,
      'stock_movements',
      p_sm.id::text,
      v_debit_account,
      v_credit_account,
      v_amount,
      null::text,
      0,
      null::uuid,
      false,
      v_fact_key
    );
  exception
    when unique_violation then
      -- Otro proceso lo creó en paralelo: se toma el existente (idempotente por fact_key).
      select je.id into entry_id
        from public.journal_entries je
       where je.organization_id = p_sm.organization_id and je.fact_key = v_fact_key
       limit 1;
      ya_existia := true;
      return;
  end;

  return;
end;
$function$;

-- Reproceso de fallos pendientes de stock_movements (cuenta_no_configurada).
-- Idempotente: si el asiento del fact_key ya existe se reutiliza (uq_journal_entries_fact_key).
-- p_limite acota el lote para no bloquear (correr varias veces hasta 'pendientes' = 0).
CREATE OR REPLACE FUNCTION public.fn_reprocesar_fallos_stock_desde(p_org integer, p_desde timestamp with time zone, p_limite integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  f public.journal_entry_failures%rowtype;
  v_sm public.stock_movements%rowtype;
  r record;
  v_resueltos integer := 0;
  v_reusados integer := 0;
  v_siguen integer := 0;
  v_sin_movimiento integer := 0;
  v_aviso text;
begin
  if p_org is null then
    raise exception 'fn_reprocesar_fallos_stock: falta la organización';
  end if;
  perform public.fn_assert_acceso_org(p_org);

  for f in
    select *
      from public.journal_entry_failures jf
     where jf.organization_id = p_org
       and jf.resolved_at is null
       and jf.reason = 'cuenta_no_configurada'
       and jf.source = 'stock_movements'
       and jf.fact_key like 'stock_movement:%'
       and (p_desde is null or jf.created_at >= p_desde)
     order by jf.id
     limit greatest(coalesce(p_limite, 1000), 1)
     for update skip locked
  loop
    begin
      select * into v_sm
        from public.stock_movements sm
       where sm.organization_id = p_org
         and sm.id::text = coalesce(nullif(f.source_id, ''), substring(f.fact_key from '^stock_movement:(.*)$'));

      if not found then
        v_sin_movimiento := v_sin_movimiento + 1;
        continue;
      end if;

      select a.entry_id, a.fallo, a.ya_existia into r
        from public.fn_asiento_stock_movement(v_sm) a;

      if r.entry_id is not null and exists (
        select 1 from public.journal_lines l where l.journal_entry_id = r.entry_id
      ) then
        update public.journal_entry_failures
           set resolved_at = now(),
               resolved_entry_id = r.entry_id,
               resolution = case when r.ya_existia
                 then 'Reproceso P1: el asiento del hecho ya existía.'
                 else 'Reproceso P1: asiento generado con la cuenta auxiliar.' end
         where organization_id = f.organization_id
           and fact_key = f.fact_key
           and resolved_at is null
           and reason = 'cuenta_no_configurada';
        if r.ya_existia then v_reusados := v_reusados + 1; else v_resueltos := v_resueltos + 1; end if;
      else
        v_siguen := v_siguen + 1;
        if v_aviso is null then
          v_aviso := f.id::text || ': ' || coalesce(r.fallo, 'sin asiento');
        end if;
      end if;
    exception when others then
      v_siguen := v_siguen + 1;
      if v_aviso is null then
        v_aviso := f.id::text || ': ' || sqlerrm;
      end if;
    end;
  end loop;

  return jsonb_build_object(
    'organizacion', p_org,
    'resueltos', v_resueltos,
    'ya_existian', v_reusados,
    'siguen', v_siguen,
    'sin_movimiento', v_sin_movimiento,
    'pendientes', (
      select count(*) from public.journal_entry_failures jf
       where jf.organization_id = p_org and jf.resolved_at is null
         and jf.reason = 'cuenta_no_configurada' and jf.source = 'stock_movements'
    ),
    'aviso', v_aviso
  );
end;
$function$;

-- Entrada pedida en P1: todos los fallos pendientes de la org (lote de p_limite; repetir hasta pendientes = 0).
CREATE OR REPLACE FUNCTION public.fn_reprocesar_fallos_stock(p_org integer, p_limite integer DEFAULT 1000)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select public.fn_reprocesar_fallos_stock_desde(p_org, null, p_limite);
$function$;

revoke all on function public.fn_asiento_stock_movement(public.stock_movements) from public, anon, authenticated;
revoke all on function public.fn_reprocesar_fallos_stock_desde(integer, timestamp with time zone, integer) from public, anon, authenticated;
revoke all on function public.fn_reprocesar_fallos_stock(integer, integer) from public, anon, authenticated;
grant execute on function public.fn_reprocesar_fallos_stock(integer, integer) to service_role;
