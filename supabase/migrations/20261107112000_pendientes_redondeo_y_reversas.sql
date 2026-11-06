-- Bandeja de pendientes: redondeo_sin_cuenta, reversa_cuenta_titulo y linea_sin_cuenta.
--
-- Estas razones no se reconstruyen desde el documento como las demás. Antes de esta
-- migración, fn_pendiente_reintentar las trataba mal:
--  * redondeo_sin_cuenta puede no traer fact_key: respondía no_reintentable. Con
--    fact_key iba al núcleo y regeneraba el asiento en vez de publicar el propuesto.
--  * Las reversas exigen accounting.reverse y publican el contra-asiento completo.
--    Aquí pedían finance.create, y un periodo original cerrado las bloqueaba, cuando
--    la reversa decide sola: fecha de anulación, o la de hoy si ese periodo se cerró.
--
-- No hay una segunda implementación. El reintento llama a las mismas funciones que
-- /app/finanzas/contabilidad/pendientes/[id], que son idempotentes:
--  * fn_publicar_redondeo_pendiente bloquea la fila y, si ya está resuelta, devuelve
--    su asiento. Con fact_key, también reutiliza el asiento que exista.
--  * fn_reversar_linea_sin_cuenta con cuentas vacías no asigna nada: publica solo si
--    ya no falta ninguna, con la clave reversal:<id>. Si faltan, no publica nada.
--
-- El periodo del redondeo se revisa aquí, en la zona de la organización, antes de
-- publicar: fn_publicar_redondeo_pendiente lo lee en UTC.
--
-- Sin cambio de datos: al aplicar no había pendientes abiertos.
--
-- Rollback: supabase/rollbacks/20261107112000_pendientes_redondeo_y_reversas_rollback.sql

-- Lo que vale un pendiente en la bandeja. En redondeo_sin_cuenta, amount es solo la
-- diferencia: lo que no entró al mayor es el asiento propuesto completo.
create or replace function public.fn_pendiente_valor(
  p_reason text,
  p_amount numeric,
  p_propuesto jsonb
)
returns numeric
language sql
immutable
set search_path to 'public', 'pg_temp'
as $function$
  select case
    when p_reason = 'redondeo_sin_cuenta' and jsonb_typeof(p_propuesto -> 'lineas') = 'array' then (
      select coalesce(sum(coalesce((l ->> 'debito')::numeric, 0)), 0)
        from jsonb_array_elements(p_propuesto -> 'lineas') l
    )
    else abs(coalesce(p_amount, 0))
  end;
$function$;

revoke all on function public.fn_pendiente_valor(text, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.fn_pendiente_valor(text, numeric, jsonb) to service_role;

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
  v_entry integer;
  v_es_reversa boolean;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  select * into v_fallo
    from public.journal_entry_failures
   where id = p_fallo_id
     and organization_id = p_organization_id;
  if v_fallo.id is null then
    raise exception 'pendiente_no_encontrado' using errcode = 'P0002';
  end if;

  v_es_reversa := v_fallo.reason in ('linea_sin_cuenta', 'reversa_cuenta_titulo');
  if not public.fn_tiene_permiso(
    p_organization_id,
    case when v_es_reversa then 'accounting.reverse' else 'finance.create' end
  ) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  if v_fallo.resolved_at is not null then
    return jsonb_build_object('estado', 'ya_resuelto', 'asiento', v_fallo.resolved_entry_id);
  end if;

  if v_fallo.reason = 'redondeo_sin_cuenta' then
    if not public.fn_fallo_periodo_abierto(p_organization_id, v_fallo.branch_id, v_fallo.entry_date) then
      return jsonb_build_object('estado', 'periodo_cerrado');
    end if;
    begin
      v_entry := public.fn_publicar_redondeo_pendiente(p_fallo_id);
    exception when others then
      update public.journal_entry_failures
         set attempts = attempts + 1, last_attempt_at = now()
       where id = p_fallo_id;
      return jsonb_build_object('estado', 'sigue', 'aviso', sqlerrm);
    end;
    select * into v_fallo from public.journal_entry_failures where id = p_fallo_id;
    if v_fallo.resolved_at is not null then
      -- Sin asiento: el documento se anuló mientras estaba pendiente.
      return jsonb_build_object(
        'estado', case when v_fallo.resolved_entry_id is null then 'ya_resuelto' else 'resuelto' end,
        'asiento', v_fallo.resolved_entry_id
      );
    end if;
    update public.journal_entry_failures
       set attempts = attempts + 1, last_attempt_at = now()
     where id = p_fallo_id;
    return jsonb_build_object('estado', 'sigue', 'aviso', v_fallo.detail);
  end if;

  if v_es_reversa then
    if coalesce(v_fallo.fact_key, '') not like 'reversal:pendiente:%' then
      return jsonb_build_object('estado', 'no_reintentable');
    end if;
    begin
      v_entry := public.fn_reversar_linea_sin_cuenta(p_fallo_id, '{}'::jsonb);
    exception when others then
      update public.journal_entry_failures
         set attempts = attempts + 1, last_attempt_at = now()
       where id = p_fallo_id;
      return jsonb_build_object('estado', 'sigue', 'aviso', sqlerrm);
    end;
    if v_entry is not null then
      return jsonb_build_object('estado', 'resuelto', 'asiento', v_entry);
    end if;
    update public.journal_entry_failures
       set attempts = attempts + 1, last_attempt_at = now()
     where id = p_fallo_id;
    return jsonb_build_object('estado', 'faltan_cuentas');
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
      select distinct on (coalesce(f.fact_key, f.id::text))
             public.fn_pendiente_valor(f.reason, f.amount, f.asiento_propuesto) as valor
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
           'importe', case when p.reason = 'redondeo_sin_cuenta'
                           then public.fn_pendiente_valor(p.reason, p.amount, p.asiento_propuesto)
                           else p.amount end,
           'motivo', p.reason,
           'detalle', p.detail,
           'sede', p.sede,
           'intentos', p.attempts,
           'ultimo_intento', p.last_attempt_at,
           -- La reversa no depende del periodo original: si está cerrado, se publica con fecha de hoy.
           'periodo_cerrado', p.reason not in ('linea_sin_cuenta', 'reversa_cuenta_titulo')
                              and not public.fn_fallo_periodo_abierto(p.organization_id, p.branch_id, p.entry_date),
           -- El redondeo publica su asiento propuesto: no necesita clave del hecho.
           'reintentable', p.fact_key is not null or p.reason = 'redondeo_sin_cuenta'
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
