-- Bandeja de pendientes contables y reintento con permiso.
--
-- Revisión de fn_reintentar_fallos_asiento (auditoría 2026-11-06):
--  * Recorre todas las organizaciones: no se le puede dar grant a authenticated.
--    La lógica pasa a fn_reintentar_fallos_nucleo y la bandeja entra por
--    fn_pendiente_reintentar, de a un pendiente, con pertenencia y permiso.
--  * No miraba el periodo. Con periodo cerrado reintentaba, borraba el asiento
--    vacío del hecho y dejaba un rechazo period_closed más en cada pasada. Ahora
--    ese pendiente no se toca.
--  * No era idempotente. Medido en aislado con la función anterior: con
--    cuenta_no_configurada las filas abiertas iban 1, 2, 4, 8 en tres pasadas,
--    porque la fila nueva también se reintenta; con un motivo fuera del conjunto
--    reintentable, una fila más por pasada. Ahora hay una sola fila abierta por
--    organización, hecho y motivo, y esa fila cuenta los intentos.
--
-- Los pendientes no entran al mayor: nada de esto escribe un asiento salvo el
-- reintento, que usa el camino normal y conserva la fecha original del hecho.
--
-- La tabla journal_entry_failures estaba vacía al aplicar: el índice único no
-- encuentra duplicados y no se toca ningún dato.
--
-- Rollback: supabase/rollbacks/20261107111000_pendientes_contables_bandeja_y_reintento_rollback.sql

alter table public.journal_entry_failures
  add column if not exists attempts integer not null default 1,
  add column if not exists last_attempt_at timestamptz;

comment on column public.journal_entry_failures.attempts is
  'Veces que se intentó contabilizar este hecho, contando el primer rechazo.';

create unique index if not exists journal_entry_failures_abierto_uq
  on public.journal_entry_failures (organization_id, fact_key, reason)
  where resolved_at is null and fact_key is not null;

create or replace function public.fn_log_journal_failure(
  p_organization_id integer,
  p_branch_id integer,
  p_entry_date timestamptz,
  p_source text,
  p_source_id text,
  p_fact_key text,
  p_debit_account text,
  p_credit_account text,
  p_amount numeric,
  p_reason text,
  p_detail text
)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
BEGIN
    INSERT INTO journal_entry_failures (
        organization_id, branch_id, entry_date, source, source_id, fact_key,
        debit_account, credit_account, amount, reason, detail
    ) VALUES (
        p_organization_id, p_branch_id, p_entry_date, p_source, p_source_id, p_fact_key,
        p_debit_account, p_credit_account, p_amount, p_reason, p_detail
    )
    ON CONFLICT (organization_id, fact_key, reason)
      WHERE resolved_at IS NULL AND fact_key IS NOT NULL
    DO UPDATE SET detail = EXCLUDED.detail,
                  last_attempt_at = now();
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'No se pudo registrar el rechazo contable (%): %', p_reason, SQLERRM;
END;
$function$;

-- ¿Se puede contabilizar en la fecha del hecho? La fecha se lee en la zona de la
-- organización: 8 p. m. del 31 en Bogotá ya es el 1 en UTC.
create or replace function public.fn_fallo_periodo_abierto(
  p_organization_id integer,
  p_branch_id integer,
  p_fecha timestamptz
)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select public.fn_is_period_open(
    p_organization_id,
    (coalesce(p_fecha, now()) at time zone public.fn_timezone_for(p_organization_id, p_branch_id))::date
  );
$function$;

revoke all on function public.fn_fallo_periodo_abierto(integer, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.fn_fallo_periodo_abierto(integer, integer, timestamptz) to service_role;

CREATE OR REPLACE FUNCTION public.fn_reprocesar_fallos_stock_desde(p_org integer, p_desde timestamp with time zone, p_limite integer DEFAULT 1000, p_desde_id bigint DEFAULT NULL)
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
  v_ultimo_id bigint := p_desde_id;
  v_vistos integer := 0;
  v_periodo_cerrado integer := 0;
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
       and coalesce(jf.fact_key, '') like 'stock_movement:%'
       and (p_desde_id is null or jf.id > p_desde_id)
       and (p_desde is null or jf.created_at >= p_desde)
     order by jf.id
     limit greatest(coalesce(p_limite, 1000), 1)
     for update skip locked
  loop
    v_ultimo_id := f.id;
    v_vistos := v_vistos + 1;
    if not public.fn_fallo_periodo_abierto(f.organization_id, f.branch_id, f.entry_date) then
      v_periodo_cerrado := v_periodo_cerrado + 1;
      continue;
    end if;
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
    'periodo_cerrado', v_periodo_cerrado,
    'sin_movimiento', v_sin_movimiento,
    'pendientes', (
      select count(*) from public.journal_entry_failures jf
       where jf.organization_id = p_org and jf.resolved_at is null
         and jf.reason = 'cuenta_no_configurada' and jf.source = 'stock_movements'
    ),
    'aviso', v_aviso,
    'siguiente_desde_id', v_ultimo_id,
    'terminado', v_vistos < greatest(coalesce(p_limite, 1000), 1)
  );
end;
$function$;

-- Núcleo del reintento. Sin parámetros: lo de siempre, todas las organizaciones.
-- Con p_fallo_id: ese pendiente, sea cual sea el motivo, incluido inventario.
-- No se abre a authenticated: la entrada es fn_pendiente_reintentar.
create or replace function public.fn_reintentar_fallos_nucleo(
  p_org integer default null,
  p_fallo_id bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  f public.journal_entry_failures%rowtype;
  v_entry integer;
  v_resueltos integer := 0;
  v_siguen integer := 0;
  v_aviso text;
  v_mov public.cash_movements%rowtype;
  v_bt public.bank_transactions%rowtype;
  v_sesion record;
  v_branch integer;
  v_compra public.invoice_purchase%rowtype;
  v_regla record;
  v_tes text;
  v_debito text;
  v_credito text;
  v_fallo text;
  v_es_entrada boolean;
  v_importe numeric;
  v_asiento record;
  v_doc uuid;
  v_total numeric;
  v_tipo text;
  v_org integer;
  v_stock jsonb;
  v_periodo_cerrado integer := 0;
  v_sin_ruta integer := 0;
  v_sm public.stock_movements%rowtype;
begin
  for f in
    select *
      from public.journal_entry_failures
     where resolved_at is null
       and fact_key is not null
       and (p_org is null or organization_id = p_org)
       and (
         -- Pedido desde la bandeja: ese pendiente, sea cual sea el motivo.
         (p_fallo_id is not null and id = p_fallo_id)
         or (
           p_fallo_id is null
           and reason in ('cuenta_linea', 'sin_cuenta', 'tercero_requerido', 'cuenta_no_configurada')
           -- Inventario (stock_movement:*) va por fn_reprocesar_fallos_stock, abajo.
           and not (reason = 'cuenta_no_configurada' and coalesce(fact_key, '') like 'stock_movement:%')
         )
       )
     order by id
     for update
  loop
    begin
      v_entry := null;
      v_fallo := null;
      v_debito := null;
      v_credito := null;

      -- Periodo cerrado: ni se toca. Reintentar solo sumaría rechazos.
      if not public.fn_fallo_periodo_abierto(f.organization_id, f.branch_id, f.entry_date) then
        v_periodo_cerrado := v_periodo_cerrado + 1;
        continue;
      end if;

      select e.id into v_entry
        from public.journal_entries e
       where e.organization_id = f.organization_id
         and e.fact_key = f.fact_key
         and exists (select 1 from public.journal_lines l where l.journal_entry_id = e.id)
       limit 1;

      if v_entry is null then
        perform set_config('app.contabilidad_mantenimiento', 'on', true);
        delete from public.journal_entries e
         where e.organization_id = f.organization_id
           and e.fact_key = f.fact_key
           and not exists (select 1 from public.journal_lines l where l.journal_entry_id = e.id);
        perform set_config('app.contabilidad_mantenimiento', '', true);
      end if;

      v_tipo := case
        when f.fact_key like 'stock_movement:%' or f.source = 'stock_movements' then 'stock'
        when f.fact_key like 'cash_move:%' or f.source = 'cash_movements' then 'caja'
        when f.fact_key like 'bank:%' or f.source = 'bank_transactions' then 'banco'
        when f.fact_key like 'accrual:purchase:%' or f.source = 'invoice_purchase' then 'compra'
        when f.fact_key like 'accrual:sale:%' or f.fact_key like 'accrual:credit_note:%' or f.source = 'invoice_sales' then 'venta'
        else 'otro'
      end;

      if v_entry is null and v_tipo = 'caja' and f.source_id ~ '^[0-9]+$' then
        select * into v_mov
          from public.cash_movements
         where id = f.source_id::integer
           and organization_id = f.organization_id;
        if found and v_mov.return_id is null then
          select cs.organization_id, cs.branch_id, cs.account_code
            into v_sesion
            from public.cash_sessions cs
           where cs.id = v_mov.cash_session_id;
          v_es_entrada := coalesce(v_mov.type, 'in') in ('in', 'deposit', 'income');
          v_importe := abs(coalesce(v_mov.amount, 0));
          if coalesce(v_mov.amount, 0) < 0 then
            v_es_entrada := not v_es_entrada;
          end if;
          if v_sesion.organization_id is not null and round(v_importe, 0) >= 1 then
            v_tes := public.fn_cuenta_caja(v_sesion.organization_id, v_sesion.branch_id, v_sesion.account_code);
            if nullif(btrim(v_mov.cuenta_contable), '') is not null then
              select a.debito, a.credito, a.fallo
                into v_debito, v_credito, v_fallo
                from public.fn_asiento_tesoreria_elegido(
                  v_sesion.organization_id,
                  case when v_es_entrada then 'in' else 'out' end,
                  v_mov.cuenta_contable,
                  v_tes
                ) a;
            else
              select a.accion, a.debito, a.credito
                into v_asiento
                from public.fn_asiento_movimiento_caja(
                  v_sesion.organization_id,
                  case when v_es_entrada then 'in' else 'out' end,
                  v_mov.concept_code
                ) a;
              v_debito := v_asiento.debito;
              v_credito := v_asiento.credito;
              if v_es_entrada and v_debito is null then
                v_debito := v_tes;
              elsif not v_es_entrada and v_credito is null then
                v_credito := v_tes;
              end if;
              if v_asiento.accion = 'omitir' then
                v_fallo := 'omitir';
              end if;
            end if;
            if v_fallo is null and v_debito is not null and v_credito is not null then
              v_entry := public.fn_create_journal_entry(
                p_organization_id := v_sesion.organization_id,
                p_branch_id := v_sesion.branch_id,
                p_entry_date := v_mov.created_at,
                p_memo := 'Mov. Caja: ' || coalesce(v_mov.type, '') || ' - ' || coalesce(v_mov.concept, ''),
                p_source := 'cash_movements',
                p_source_id := v_mov.id::text,
                p_debit_account := v_debito,
                p_credit_account := v_credito,
                p_amount := v_importe,
                p_fact_key := f.fact_key,
                p_cost_center_id := case
                  when v_mov.distribucion_id is not null then null
                  else coalesce(v_mov.centro_costo_id, public.fn_centro_defecto(v_sesion.organization_id, v_sesion.branch_id))
                end,
                p_cuenta_sin_centro := v_tes
              );
            end if;
          end if;
        end if;
      elsif v_entry is null and v_tipo = 'banco' and f.source_id ~ '^[0-9]+$' then
        select * into v_bt
          from public.bank_transactions
         where id = f.source_id::integer
           and organization_id = f.organization_id;
        if found then
          v_importe := abs(coalesce(v_bt.amount, 0));
          if round(v_importe, 0) >= 1 then
            select b.branch_id, nullif(btrim(b.account_code), '')
              into v_branch, v_tes
              from public.bank_accounts b
             where b.id = v_bt.bank_account_id
               and b.organization_id = v_bt.organization_id;
            v_branch := coalesce(
              v_branch,
              (select min(br.id) from public.branches br where br.organization_id = v_bt.organization_id)
            );
            v_tes := public.fn_cuenta_caja(v_bt.organization_id, v_branch, v_tes);
            if nullif(btrim(v_bt.cuenta_contable), '') is not null then
              v_es_entrada := case
                when v_bt.transaction_type in ('deposit', 'interest') then true
                when v_bt.transaction_type in ('withdrawal', 'fee') then false
                else coalesce(v_bt.amount, 0) >= 0
              end;
              select a.debito, a.credito, a.fallo
                into v_debito, v_credito, v_fallo
                from public.fn_asiento_tesoreria_elegido(
                  v_bt.organization_id,
                  case when v_es_entrada then 'in' else 'out' end,
                  v_bt.cuenta_contable,
                  v_tes
                ) a;
            else
              if coalesce(v_bt.amount, 0) < 0 then
                v_debito := public.fn_primera_cuenta_detalle(v_bt.organization_id, array['5305', '5195', '5135']);
                v_credito := v_tes;
              else
                v_debito := v_tes;
                v_credito := public.fn_primera_cuenta_detalle(v_bt.organization_id, array[public.fn_cuenta_ingresos_diversos(v_bt.organization_id, v_branch)]);
              end if;
              if v_debito is null or v_credito is null
                 or left(coalesce(v_debito, ''), 1) = '4'
                 or left(coalesce(v_credito, ''), 1) = '5' then
                v_fallo := 'sin_cuenta';
              end if;
            end if;
            if v_fallo is null and v_debito is not null and v_credito is not null then
              v_entry := public.fn_create_journal_entry(
                p_organization_id := v_bt.organization_id,
                p_branch_id := v_branch,
                p_entry_date := coalesce(v_bt.trans_date, v_bt.created_at, f.entry_date, now()),
                p_memo := 'Trans. Bancaria - ' || coalesce(v_bt.description, v_bt.transaction_type),
                p_source := 'bank_transactions',
                p_source_id := v_bt.id::text,
                p_debit_account := v_debito,
                p_credit_account := v_credito,
                p_amount := v_importe,
                p_fact_key := f.fact_key,
                p_cost_center_id := case
                  when v_bt.distribucion_id is not null then null
                  else coalesce(v_bt.centro_costo_id, public.fn_centro_defecto(v_bt.organization_id, v_branch))
                end,
                p_cuenta_sin_centro := v_tes
              );
            end if;
          end if;
        end if;
      elsif v_entry is null and v_tipo in ('compra', 'venta') then
        v_doc := null;
        if f.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
          if v_tipo = 'compra' and exists (
            select 1 from public.invoice_purchase i
             where i.id = f.source_id::uuid and i.organization_id = f.organization_id
          ) then
            v_doc := f.source_id::uuid;
          elsif v_tipo = 'venta' and exists (
            select 1 from public.invoice_sales i
             where i.id = f.source_id::uuid and i.organization_id = f.organization_id
          ) then
            v_doc := f.source_id::uuid;
          end if;
        end if;
        if v_doc is null and substring(f.fact_key from '[0-9a-f-]{36}$') is not null then
          v_doc := substring(f.fact_key from '[0-9a-f-]{36}$')::uuid;
        end if;

        if v_tipo = 'compra' and v_doc is not null then
          select * into v_compra
            from public.invoice_purchase i
           where i.id = v_doc and i.organization_id = f.organization_id;
          v_total := coalesce(v_compra.total, 0);
          if v_compra.id is not null and round(v_total, 0) <= 0 and v_total >= 0 then
            update public.journal_entry_failures
               set resolved_at = now(),
                   resolution = 'importe_cero'
             where id = f.id and resolved_at is null;
            v_resueltos := v_resueltos + 1;
            continue;
          end if;
          if v_compra.id is not null then
            if public.fn_documento_tiene_cuenta_propia(v_compra.organization_id, v_compra.id, 'compra') then
              v_entry := public.fn_asiento_documento_por_lineas(v_compra.id, 'compra', f.fact_key);
            else
              select * into v_regla from public.fn_regla_devengo_compra(v_compra.organization_id);
              v_debito := public.fn_cuenta_movimiento_o_detalle(
                v_compra.organization_id, v_compra.branch_id, v_regla.debit_account_code
              );
              v_credito := public.fn_cuenta_movimiento_o_detalle(
                v_compra.organization_id, v_compra.branch_id, v_regla.credit_account_code
              );
              v_fallo := public.fn_bloqueo_tercero_documento(
                v_compra.organization_id, v_compra.branch_id, 'invoice_purchase', v_compra.id
              );
              if v_fallo is null and v_debito is not null and v_credito is not null then
                v_entry := public.fn_create_journal_entry(
                  p_organization_id := v_compra.organization_id,
                  p_branch_id := v_compra.branch_id,
                  p_entry_date := coalesce(v_compra.issue_date, f.entry_date, now()),
                  p_memo := 'Compra ' || coalesce(v_compra.number_ext, v_compra.id::text),
                  p_source := 'invoice_purchase',
                  p_source_id := v_compra.id::text,
                  p_debit_account := v_debito,
                  p_credit_account := v_credito,
                  p_amount := v_compra.total,
                  p_tax_account := v_regla.tax_account_code,
                  p_tax_amount := case when v_regla.use_tax_from_document then coalesce(v_compra.tax_total, 0) else 0 end,
                  p_tax_is_credit := false,
                  p_fact_key := f.fact_key
                );
              end if;
            end if;
          end if;
        elsif v_tipo = 'venta' and v_doc is not null then
          select i.total into v_total
            from public.invoice_sales i
           where i.id = v_doc and i.organization_id = f.organization_id;
          if v_total is not null and round(v_total, 0) <= 0 and v_total >= 0 then
            update public.journal_entry_failures
               set resolved_at = now(),
                   resolution = 'importe_cero'
             where id = f.id and resolved_at is null;
            v_resueltos := v_resueltos + 1;
            continue;
          end if;
          if v_total is not null then
            v_entry := public.fn_asiento_documento_por_lineas(
              v_doc,
              case when f.fact_key like 'accrual:credit_note:%' then 'nota_credito' else 'venta' end,
              f.fact_key
            );
          end if;
        end if;
      elsif v_entry is null and v_tipo = 'stock' and p_fallo_id is not null then
        select * into v_sm
          from public.stock_movements sm
         where sm.organization_id = f.organization_id
           and sm.id::text = coalesce(nullif(f.source_id, ''), substring(f.fact_key from '^stock_movement:(.*)$'));
        if found then
          select a.entry_id into v_entry from public.fn_asiento_stock_movement(v_sm) a;
        end if;
      elsif v_entry is null and v_tipo = 'otro' then
        v_sin_ruta := v_sin_ruta + 1;
      end if;

      if v_entry is not null and exists (
        select 1 from public.journal_lines l where l.journal_entry_id = v_entry
      ) then
        update public.journal_entry_failures
           set resolved_at = now(),
               resolved_entry_id = v_entry,
               resolution = 'Reintento automático por la clave del hecho.'
         where organization_id = f.organization_id
           and fact_key = f.fact_key
           and resolved_at is null;
        v_resueltos := v_resueltos + 1;
      else
        v_siguen := v_siguen + 1;
        update public.journal_entry_failures
           set attempts = attempts + 1,
               last_attempt_at = now()
         where id = f.id;
      end if;
    exception when others then
      v_siguen := v_siguen + 1;
      update public.journal_entry_failures
         set attempts = attempts + 1,
             last_attempt_at = now()
       where id = f.id;
      if v_aviso is null then
        v_aviso := f.id::text || ': ' || sqlerrm;
      end if;
    end;
  end loop;

  -- Fallos de inventario cuenta_no_configurada NUEVOS (desde el 26-oct-2026 Bogotá).
  -- El atraso anterior (345, 346, 199: 12.244 fallos) NO lo toca el cron: se reprocesa a mano
  -- con fn_reprocesar_fallos_stock(org) y el OK de Juan.
  if p_fallo_id is null then
  for v_org in
    select distinct jf.organization_id
      from public.journal_entry_failures jf
     where jf.resolved_at is null
       and jf.reason = 'cuenta_no_configurada'
       and jf.source = 'stock_movements'
       and jf.fact_key like 'stock_movement:%'
       and jf.created_at >= timestamptz '2026-10-26 00:00:00-05'
       and (p_org is null or jf.organization_id = p_org)
  loop
    begin
      v_stock := public.fn_reprocesar_fallos_stock_desde(v_org, timestamptz '2026-10-26 00:00:00-05', 500);
      v_resueltos := v_resueltos + coalesce((v_stock->>'resueltos')::integer, 0) + coalesce((v_stock->>'ya_existian')::integer, 0);
      v_siguen := v_siguen + coalesce((v_stock->>'siguen')::integer, 0);
      v_periodo_cerrado := v_periodo_cerrado + coalesce((v_stock->>'periodo_cerrado')::integer, 0);
      if v_aviso is null then
        v_aviso := v_stock->>'aviso';
      end if;
    exception when others then
      if v_aviso is null then
        v_aviso := 'stock org ' || v_org || ': ' || sqlerrm;
      end if;
    end;
  end loop;
  end if;

  return jsonb_build_object(
    'resueltos', v_resueltos,
    'siguen', v_siguen,
    'periodo_cerrado', v_periodo_cerrado,
    'sin_ruta', v_sin_ruta,
    'aviso', v_aviso
  );
end;
$function$;

revoke all on function public.fn_reintentar_fallos_nucleo(integer, bigint) from public, anon, authenticated;
grant execute on function public.fn_reintentar_fallos_nucleo(integer, bigint) to service_role;

-- La firma anterior se conserva, solo para service_role.
create or replace function public.fn_reintentar_fallos_asiento()
returns jsonb
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select public.fn_reintentar_fallos_nucleo(null, null);
$function$;

revoke all on function public.fn_reintentar_fallos_asiento() from public, anon, authenticated;
grant execute on function public.fn_reintentar_fallos_asiento() to service_role;

-- Reintento desde la bandeja: un pendiente de la organización de la sesión.
create or replace function public.fn_pendiente_reintentar(
  p_organization_id integer,
  p_fallo_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_fallo public.journal_entry_failures%rowtype;
  v_res jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.create') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  select * into v_fallo
    from public.journal_entry_failures
   where id = p_fallo_id
     and organization_id = p_organization_id;
  if v_fallo.id is null then
    raise exception 'pendiente_no_encontrado' using errcode = 'P0002';
  end if;
  if v_fallo.resolved_at is not null then
    return jsonb_build_object('estado', 'ya_resuelto', 'asiento', v_fallo.resolved_entry_id);
  end if;
  if v_fallo.fact_key is null then
    return jsonb_build_object('estado', 'no_reintentable');
  end if;

  v_res := public.fn_reintentar_fallos_nucleo(p_organization_id, p_fallo_id);

  if coalesce((v_res ->> 'resueltos')::integer, 0) > 0 then
    select * into v_fallo from public.journal_entry_failures where id = p_fallo_id;
    return jsonb_build_object('estado', 'resuelto', 'asiento', v_fallo.resolved_entry_id);
  end if;
  if coalesce((v_res ->> 'periodo_cerrado')::integer, 0) > 0 then
    return jsonb_build_object('estado', 'periodo_cerrado');
  end if;
  if coalesce((v_res ->> 'sin_ruta')::integer, 0) > 0 then
    return jsonb_build_object('estado', 'no_reintentable');
  end if;
  return jsonb_build_object('estado', 'sigue', 'aviso', v_res ->> 'aviso');
end;
$function$;

revoke all on function public.fn_pendiente_reintentar(integer, bigint) from public, anon;
grant execute on function public.fn_pendiente_reintentar(integer, bigint) to authenticated, service_role;

-- Datos de la bandeja. Solo lee: lo que está aquí no está en el mayor.
create or replace function public.fn_pendientes_contables(
  p_organization_id integer,
  p_busqueda text default null,
  p_limite integer default 25,
  p_desplazamiento integer default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tz text;
  v_hoy date;
  v_busqueda text := nullif(lower(btrim(coalesce(p_busqueda, ''))), '');
  v_limite integer := least(greatest(coalesce(p_limite, 25), 1), 200);
  v_desde integer := greatest(coalesce(p_desplazamiento, 0), 0);
  v_total integer;
  v_antiguo timestamptz;
  v_valor numeric;
  v_bloquean integer := 0;
  v_periodo_inicio date;
  v_filtradas integer;
  v_filas jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.view') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  v_tz := public.fn_timezone_for(p_organization_id, null);
  v_hoy := (now() at time zone v_tz)::date;

  select count(*), min(f.created_at)
    into v_total, v_antiguo
    from public.journal_entry_failures f
   where f.organization_id = p_organization_id
     and f.resolved_at is null;

  -- Un hecho con dos motivos abiertos no suma dos veces su valor.
  select coalesce(sum(u.valor), 0) into v_valor
    from (
      select distinct on (coalesce(f.fact_key, f.id::text)) abs(coalesce(f.amount, 0)) as valor
        from public.journal_entry_failures f
       where f.organization_id = p_organization_id
         and f.resolved_at is null
       order by coalesce(f.fact_key, f.id::text), f.id
    ) u;

  -- El primer periodo abierto con pendientes: es el que no se deja cerrar.
  select p.start_date, count(*)
    into v_periodo_inicio, v_bloquean
    from public.fiscal_periods p
    join public.journal_entry_failures f
      on f.organization_id = p.organization_id
     and f.resolved_at is null
     and (coalesce(f.entry_date, f.created_at) at time zone v_tz)::date between p.start_date and p.end_date
   where p.organization_id = p_organization_id
     and p.period_type = 'monthly'
     and p.status = 'open'
   group by p.start_date
   order by p.start_date
   limit 1;

  with base as (
    select f.*,
           coalesce(vs.number, ip.number_ext, f.source_id) as documento,
           b.name as sede
      from public.journal_entry_failures f
      left join public.invoice_sales vs
        on f.source = 'invoice_sales'
       and vs.organization_id = f.organization_id
       and vs.id = case when f.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                        then f.source_id::uuid end
      left join public.invoice_purchase ip
        on f.source = 'invoice_purchase'
       and ip.organization_id = f.organization_id
       and ip.id = case when f.source_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                        then f.source_id::uuid end
      left join public.branches b
        on b.id = f.branch_id
       and b.organization_id = f.organization_id
     where f.organization_id = p_organization_id
       and f.resolved_at is null
  ), filtradas as (
    select *
      from base x
     where v_busqueda is null
        or position(v_busqueda in lower(concat_ws(' ', x.documento, x.source, x.debit_account, x.credit_account, x.reason, x.detail))) > 0
  ), pagina as (
    select *, count(*) over () as total_filtradas
      from filtradas
     order by created_at, id
     limit v_limite offset v_desde
  )
  select coalesce(max(p.total_filtradas), 0)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'fecha', p.entry_date,
           'creado', p.created_at,
           'dias', greatest(v_hoy - (p.created_at at time zone v_tz)::date, 0),
           'origen', p.source,
           'origen_id', p.source_id,
           'documento', p.documento,
           'clave', p.fact_key,
           'debito', p.debit_account,
           'credito', p.credit_account,
           'importe', p.amount,
           'motivo', p.reason,
           'detalle', p.detail,
           'sede', p.sede,
           'intentos', p.attempts,
           'ultimo_intento', p.last_attempt_at,
           'periodo_cerrado', not public.fn_fallo_periodo_abierto(p.organization_id, p.branch_id, p.entry_date),
           'reintentable', p.fact_key is not null
         ) order by p.created_at, p.id), '[]'::jsonb)
    into v_filtradas, v_filas
    from pagina p;

  return jsonb_build_object(
    'pendientes', v_total,
    'mas_antiguo_dias', case when v_antiguo is null then null
                             else greatest(v_hoy - (v_antiguo at time zone v_tz)::date, 0) end,
    'bloquean_cierre', coalesce(v_bloquean, 0),
    'periodo_inicio', v_periodo_inicio,
    'valor', v_valor,
    'total_filtradas', v_filtradas,
    'filas', v_filas
  );
end;
$function$;

revoke all on function public.fn_pendientes_contables(integer, text, integer, integer) from public, anon;
grant execute on function public.fn_pendientes_contables(integer, text, integer, integer) to authenticated, service_role;
