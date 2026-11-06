-- Depreciación mensual en línea recta, idempotente (hallazgo 9 de la auditoría del Contador).
--
-- FixedAssetService devolvía 0 para saldo decreciente y unidades de producción, y no había
-- ningún proceso: fixed_assets y asset_depreciations estaban vacías al aplicar.
--
--  * Solo línea recta. Los demás métodos quedan cerrados con un CHECK: no hay regla
--    verificada y un 0 se leería como cálculo válido.
--  * Cuota del mes n = redondeo a pesos de base * n / vida útil, menos lo ya depreciado. Así
--    la suma de las cuotas da la base exacta aunque la división no sea entera.
--  * La primera cuota es la del mes siguiente a la adquisición. Es una decisión del Contador
--    que se puede cambiar: queda en el reporte de la entrega.
--  * Los terrenos no se deprecian.
--  * Meses atrasados: se contabilizan en orden, cada uno con su fecha.
--  * Solo con cuentas que existan y sean de movimiento. Si no, pendiente visible: una fila en
--    journal_entry_failures, que se resuelve cuando el proceso vuelve a correr bien.
--  * Idempotente: índice único por activo y mes, y fact_key en el asiento.
--
-- Rollback: supabase/rollbacks/20261107133000_depreciacion_linea_recta_rollback.sql

create unique index if not exists asset_depreciations_activo_mes_uq
  on public.asset_depreciations (fixed_asset_id, period_date);

alter table public.fixed_assets
  drop constraint if exists fixed_assets_metodo_disponible_check;
alter table public.fixed_assets
  add constraint fixed_assets_metodo_disponible_check
  check (depreciation_method = 'straight_line') not valid;

comment on constraint fixed_assets_metodo_disponible_check on public.fixed_assets is
  'Solo línea recta tiene cálculo verificado. Los demás métodos se abren cuando exista su regla.';

-- Con depreciación registrada, lo que alimenta el cálculo no cambia y el activo no se borra.
create or replace function public.fn_trg_activo_con_depreciacion()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if exists (select 1 from public.asset_depreciations d where d.fixed_asset_id = old.id) then
    if tg_op = 'DELETE' then
      raise exception 'ACTIVO_CON_DEPRECIACION: el activo % ya tiene depreciación contabilizada', old.code
        using errcode = '23514';
    end if;
    if new.acquisition_cost is distinct from old.acquisition_cost
       or new.salvage_value is distinct from old.salvage_value
       or new.useful_life_months is distinct from old.useful_life_months
       or new.acquisition_date is distinct from old.acquisition_date
       or new.depreciation_method is distinct from old.depreciation_method then
      raise exception 'ACTIVO_CON_DEPRECIACION: el activo % ya tiene depreciación contabilizada', old.code
        using errcode = '23514';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$function$;

drop trigger if exists trg_activo_con_depreciacion on public.fixed_assets;
create trigger trg_activo_con_depreciacion
  before update or delete on public.fixed_assets
  for each row execute function public.fn_trg_activo_con_depreciacion();

-- Por qué un activo no se puede depreciar. NULL = se puede. Terrenos y activos sin base
-- no se consideran aquí: no generan cuota ni pendiente.
create or replace function public.fn_depreciacion_bloqueo(p_activo public.fixed_assets)
returns text
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_cuenta text;
begin
  if p_activo.depreciation_method is distinct from 'straight_line' then
    return 'metodo_no_disponible';
  end if;
  if nullif(btrim(p_activo.account_depreciation_code), '') is null
     or nullif(btrim(p_activo.account_expense_code), '') is null then
    return 'faltan_cuentas';
  end if;
  foreach v_cuenta in array array[p_activo.account_depreciation_code, p_activo.account_expense_code] loop
    if not exists (
      select 1 from public.chart_of_accounts c
       where c.organization_id = p_activo.organization_id
         and c.account_code = v_cuenta
         and c.es_movimiento is true
         and coalesce(c.is_active, true)
    ) then
      return 'cuenta_no_es_de_movimiento';
    end if;
  end loop;
  if abs(coalesce(p_activo.accumulated_depreciation, 0) - coalesce((
       select sum(d.depreciation_amount) from public.asset_depreciations d where d.fixed_asset_id = p_activo.id
     ), 0)) >= 1 then
    return 'acumulada_sin_detalle';
  end if;
  return null;
end;
$function$;

revoke all on function public.fn_depreciacion_bloqueo(public.fixed_assets) from public, anon, authenticated;
grant execute on function public.fn_depreciacion_bloqueo(public.fixed_assets) to service_role;

-- Lectura para la pantalla: qué activos quedarían pendientes y qué cuota lleva el mes.
create or replace function public.fn_depreciacion_estado(p_organization_id integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.view') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'hoy', public.fn_today_for(p_organization_id, null),
    'bloqueos', coalesce((
      select jsonb_agg(jsonb_build_object('activo_id', a.id, 'motivo', public.fn_depreciacion_bloqueo(a)))
        from public.fixed_assets a
       where a.organization_id = p_organization_id
         and a.status = 'active'
         and a.asset_type <> 'land'
         and public.fn_depreciacion_bloqueo(a) is not null
    ), '[]'::jsonb),
    'ultimo_mes', (
      select max(d.period_date) from public.asset_depreciations d
       where d.organization_id = p_organization_id
    )
  );
end;
$function$;

revoke all on function public.fn_depreciacion_estado(integer) from public, anon;
grant execute on function public.fn_depreciacion_estado(integer) to authenticated, service_role;

create or replace function public.fn_depreciar_mes(p_organization_id integer, p_mes date)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_tz text;
  v_hoy date;
  v_mes_ini date;
  v_mes_fin date;
  a public.fixed_assets%rowtype;
  v_motivo text;
  v_base numeric;
  v_vida integer;
  v_primero date;
  v_n integer;
  v_cierre date;
  v_ultimo date;
  v_acum numeric;
  v_meta numeric;
  v_cuota numeric;
  v_llave text;
  v_entry integer;
  v_asientos integer := 0;
  v_ya integer := 0;
  v_terminados integer := 0;
  v_total numeric := 0;
  v_pendientes jsonb := '[]'::jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if not public.fn_tiene_permiso(p_organization_id, 'finance.create') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if p_mes is null then
    raise exception 'mes_invalido' using errcode = '22023';
  end if;

  v_tz := public.fn_timezone_for(p_organization_id, null);
  v_hoy := public.fn_today_for(p_organization_id, null);
  v_mes_ini := date_trunc('month', p_mes)::date;
  v_mes_fin := (v_mes_ini + interval '1 month - 1 day')::date;
  if v_mes_ini > date_trunc('month', v_hoy)::date then
    raise exception 'mes_futuro' using errcode = '22023';
  end if;

  -- Dos clics a la vez no chocan: el segundo espera y encuentra todo hecho.
  perform pg_advisory_xact_lock(hashtextextended('fn_depreciar_mes:' || p_organization_id, 0));

  for a in
    select * from public.fixed_assets
     where organization_id = p_organization_id
       and status = 'active'
       and asset_type <> 'land'
     order by code
     for update
  loop
    v_llave := 'depreciacion:' || a.id::text || ':' || to_char(v_mes_ini, 'YYYY-MM');

    v_motivo := public.fn_depreciacion_bloqueo(a);
    if v_motivo is not null then
      perform public.fn_log_journal_failure(p_organization_id, null,
        (v_mes_fin + time '12:00') at time zone v_tz, 'asset_depreciations', a.id::text, v_llave,
        a.account_expense_code, a.account_depreciation_code, null, v_motivo,
        'Activo ' || a.code || ': no se contabiliza la depreciación');
      v_pendientes := v_pendientes || jsonb_build_object('activo_id', a.id, 'codigo', a.code, 'motivo', v_motivo);
      continue;
    end if;

    v_base := coalesce(a.acquisition_cost, 0) - coalesce(a.salvage_value, 0);
    v_vida := a.useful_life_months;
    if v_base <= 0 or coalesce(v_vida, 0) <= 0 then
      continue;
    end if;

    v_primero := (date_trunc('month', a.acquisition_date) + interval '1 month')::date;
    select max(d.period_date) into v_ultimo from public.asset_depreciations d where d.fixed_asset_id = a.id;
    v_acum := coalesce(a.accumulated_depreciation, 0);
    v_cierre := coalesce((date_trunc('month', v_ultimo) + interval '2 month - 1 day')::date,
                         (v_primero + interval '1 month - 1 day')::date);

    if v_ultimo is not null and v_ultimo >= v_mes_fin then
      v_ya := v_ya + 1;
    end if;

    while v_cierre <= v_mes_fin loop
      v_n := (extract(year from v_cierre)::integer - extract(year from v_primero)::integer) * 12
           + extract(month from v_cierre)::integer - extract(month from v_primero)::integer + 1;
      exit when v_n > v_vida;

      v_meta := round(v_base * v_n / v_vida, 0);
      v_cuota := v_meta - v_acum;
      v_llave := 'depreciacion:' || a.id::text || ':' || to_char(v_cierre, 'YYYY-MM');

      if v_cuota > 0 then
        begin
          v_entry := public.fn_create_journal_entry(
            p_organization_id := p_organization_id,
            p_branch_id := null,
            p_entry_date := (v_cierre + time '12:00') at time zone v_tz,
            p_memo := 'Depreciación ' || a.code || ' ' || to_char(v_cierre, 'YYYY-MM'),
            p_source := 'asset_depreciations',
            p_source_id := a.id::text,
            p_debit_account := a.account_expense_code,
            p_credit_account := a.account_depreciation_code,
            p_amount := v_cuota,
            p_created_by := v_uid,
            p_fact_key := v_llave,
            p_cost_center_id := a.cost_center_id
          );
        exception when others then
          v_entry := null;
          perform public.fn_log_journal_failure(p_organization_id, null,
            (v_cierre + time '12:00') at time zone v_tz, 'asset_depreciations', a.id::text, v_llave,
            a.account_expense_code, a.account_depreciation_code, v_cuota, 'cuenta_linea', sqlerrm);
        end;

        if v_entry is null then
          v_pendientes := v_pendientes || jsonb_build_object(
            'activo_id', a.id, 'codigo', a.code, 'mes', to_char(v_cierre, 'YYYY-MM'),
            'motivo', coalesce((
              select f.reason from public.journal_entry_failures f
               where f.organization_id = p_organization_id and f.fact_key = v_llave and f.resolved_at is null
               order by f.id desc limit 1
            ), 'sin_asiento'));
          exit;
        end if;

        insert into public.asset_depreciations (
          organization_id, fixed_asset_id, period_date, depreciation_amount, accumulated_after, journal_entry_id
        ) values (
          p_organization_id, a.id, v_cierre, v_cuota, v_meta, v_entry
        );

        update public.journal_entry_failures
           set resolved_at = now(), resolved_entry_id = v_entry, resolution = 'Depreciación contabilizada'
         where organization_id = p_organization_id
           and fact_key = v_llave
           and resolved_at is null;

        v_acum := v_meta;
        v_asientos := v_asientos + 1;
        v_total := v_total + v_cuota;
      else
        -- Base muy pequeña para la vida útil: el mes no suma un peso entero.
        insert into public.asset_depreciations (
          organization_id, fixed_asset_id, period_date, depreciation_amount, accumulated_after
        ) values (
          p_organization_id, a.id, v_cierre, 0, v_acum
        );
      end if;

      v_cierre := (date_trunc('month', v_cierre) + interval '2 month - 1 day')::date;
    end loop;

    -- Pendientes abiertos de meses en que el activo ya no estaba bloqueado.
    update public.journal_entry_failures f
       set resolved_at = now(), resolution = 'El bloqueo se corrigió'
     where f.organization_id = p_organization_id
       and f.source = 'asset_depreciations'
       and f.source_id = a.id::text
       and f.resolved_at is null
       and f.reason in ('metodo_no_disponible', 'faltan_cuentas', 'cuenta_no_es_de_movimiento', 'acumulada_sin_detalle');

    if v_acum is distinct from a.accumulated_depreciation then
      update public.fixed_assets
         set accumulated_depreciation = v_acum,
             current_value = a.acquisition_cost - v_acum,
             status = case when v_acum >= round(v_base, 0) then 'fully_depreciated' else status end,
             updated_at = now()
       where id = a.id;
      if v_acum >= round(v_base, 0) then
        v_terminados := v_terminados + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'mes', to_char(v_mes_ini, 'YYYY-MM'),
    'asientos', v_asientos,
    'total', v_total,
    'ya_depreciados', v_ya,
    'terminados', v_terminados,
    'pendientes', v_pendientes
  );
end;
$function$;

revoke all on function public.fn_depreciar_mes(integer, date) from public, anon;
grant execute on function public.fn_depreciar_mes(integer, date) to authenticated, service_role;
