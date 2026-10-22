create or replace function public.fn_cierre_firmar(p_cierre uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.report_closings;
  v_periodo uuid;
  v_anio smallint;
  v_mes smallint;
  v_cierra boolean := false;
  v_codigo text;
begin
  if v_uid is null then
    raise exception 'ORG_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_c from public.report_closings where id = p_cierre for update;
  if v_c.id is null then
    raise exception 'cierre_no_encontrado' using errcode = 'P0002';
  end if;

  perform public.fn_finanzas_exigir_permiso(v_c.organization_id, array['finance.approve']);
  perform public.reporte_exigir_alcance_sucursal(v_c.organization_id, v_c.branch_id);

  if v_c.estado = 'firmado' then
    raise exception 'cierre_ya_firmado' using errcode = '55000';
  end if;
  if v_c.estado <> 'emitido' then
    raise exception 'cierre_reemplazado' using errcode = '55000';
  end if;

  v_anio := extract(year from v_c.fecha_inicio)::smallint;
  v_mes := extract(month from v_c.fecha_inicio)::smallint;

  if v_c.branch_id is null and v_c.hora_inicio is null then
    if v_c.tipo = 'mensual'
       and v_c.fecha_inicio = date_trunc('month', v_c.fecha_inicio)::date
       and v_c.fecha_fin = (date_trunc('month', v_c.fecha_inicio) + interval '1 month - 1 day')::date then
      v_cierra := true;
      select fp.id into v_periodo from public.fiscal_periods fp
      where fp.organization_id = v_c.organization_id
        and fp.period_type = 'monthly' and fp.year = v_anio and fp.month = v_mes
      for update;
      if v_periodo is null then
        insert into public.fiscal_periods (organization_id, year, month, period_type, start_date, end_date, status)
        values (v_c.organization_id, v_anio, v_mes, 'monthly', v_c.fecha_inicio, v_c.fecha_fin, 'open')
        returning id into v_periodo;
      end if;
    elsif v_c.tipo = 'anual'
       and v_c.fecha_inicio = make_date(v_anio, 1, 1)
       and v_c.fecha_fin = make_date(v_anio, 12, 31) then
      v_cierra := true;
      -- month es NULL en los anuales: el UNIQUE no deduplica, se busca aparte.
      select fp.id into v_periodo from public.fiscal_periods fp
      where fp.organization_id = v_c.organization_id
        and fp.period_type = 'yearly' and fp.year = v_anio and fp.month is null
      order by fp.created_at
      limit 1
      for update;
      if v_periodo is null then
        insert into public.fiscal_periods (organization_id, year, month, period_type, start_date, end_date, status)
        values (v_c.organization_id, v_anio, null, 'yearly', v_c.fecha_inicio, v_c.fecha_fin, 'open')
        returning id into v_periodo;
      end if;
    end if;
  end if;

  if v_cierra then
    v_codigo := case
      when v_c.tipo = 'anual' then 'accounting.fiscal_year.close'
      else 'accounting.period.close'
    end;
    perform public.fn_exigir_permiso_contable(v_c.organization_id, v_codigo);
    perform set_config('finanzas.cierre_autorizado', '1', true);
    update public.fiscal_periods
       set status = 'closed', closed_by = v_uid, closed_at = now(),
           notes = concat_ws(E'\n', nullif(notes, ''), 'Cerrado al firmar ' || v_c.numero || ' v' || v_c.version)
     where id = v_periodo;
    perform public.fn_auditar_cierre_contable(
      v_c.organization_id,
      case when v_c.tipo = 'anual' then 'fiscal_year' else 'fiscal_period' end,
      v_periodo::text,
      'close',
      jsonb_build_object('anio', v_anio, 'mes', v_mes, 'origen', 'fn_cierre_firmar', 'cierre_id', p_cierre)
    );
  end if;

  update public.report_closings
     set estado = 'firmado', firmado_por = v_uid, firmado_en = now(),
         fiscal_period_id = case when v_cierra then v_periodo else fiscal_period_id end,
         updated_at = now()
   where id = v_c.id
  returning * into v_c;

  perform public.fn_cierre_evento(
    v_c, v_uid, 'firmar',
    jsonb_build_object('cierra_periodo', v_cierra, 'fiscal_period_id', v_periodo)
  );

  return jsonb_build_object(
    'id', v_c.id, 'numero', v_c.numero, 'version', v_c.version,
    'estado', v_c.estado, 'cierra_periodo', v_cierra, 'fiscal_period_id', v_periodo
  );
end;
$$;

revoke all on function public.fn_cierre_firmar(uuid) from public, anon;
grant execute on function public.fn_cierre_firmar(uuid) to authenticated, service_role;

create or replace function public.fn_cierre_reabrir(p_cierre uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_uid uuid := auth.uid();
  v_c public.report_closings;
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
  v_tipo text;
  v_anio integer;
  v_codigo text;
begin
  if v_uid is null then
    raise exception 'ORG_FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_c from public.report_closings where id = p_cierre for update;
  if v_c.id is null then
    raise exception 'cierre_no_encontrado' using errcode = 'P0002';
  end if;

  perform public.fn_finanzas_exigir_permiso(v_c.organization_id, array['accounting.reverse']);
  perform public.reporte_exigir_alcance_sucursal(v_c.organization_id, v_c.branch_id);

  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'motivo_requerido' using errcode = '22023';
  end if;
  if v_c.estado <> 'firmado' then
    raise exception 'cierre_no_firmado' using errcode = '55000';
  end if;

  if v_c.fiscal_period_id is not null then
    select fp.period_type, fp.year
      into v_tipo, v_anio
      from public.fiscal_periods fp
     where fp.id = v_c.fiscal_period_id
       and fp.organization_id = v_c.organization_id;
    v_codigo := case
      when v_tipo = 'yearly' then 'accounting.fiscal_year.reopen'
      else 'accounting.period.reopen'
    end;
    perform public.fn_exigir_permiso_contable(v_c.organization_id, v_codigo);
    perform set_config('finanzas.cierre_autorizado', '1', true);
    update public.fiscal_periods
       set status = 'open', closed_by = null, closed_at = null,
           notes = concat_ws(E'\n', nullif(notes, ''), 'Reabierto desde ' || v_c.numero || ' v' || v_c.version || ': ' || v_motivo)
     where id = v_c.fiscal_period_id
       and organization_id = v_c.organization_id;
    perform public.fn_auditar_cierre_contable(
      v_c.organization_id,
      case when v_tipo = 'yearly' then 'fiscal_year' else 'fiscal_period' end,
      v_c.fiscal_period_id::text,
      'reopen',
      jsonb_build_object('anio', v_anio, 'period_type', v_tipo, 'origen', 'fn_cierre_reabrir', 'cierre_id', p_cierre)
    );
  end if;

  update public.report_closings
     set estado = 'emitido', reabierto_por = v_uid, reabierto_en = now(),
         motivo_reapertura = v_motivo, updated_at = now()
   where id = v_c.id
  returning * into v_c;

  perform public.fn_cierre_evento(
    v_c, v_uid, 'reabrir',
    jsonb_build_object('motivo', v_motivo, 'fiscal_period_id', v_c.fiscal_period_id)
  );

  return jsonb_build_object(
    'id', v_c.id, 'numero', v_c.numero, 'version', v_c.version,
    'estado', v_c.estado, 'fiscal_period_id', v_c.fiscal_period_id
  );
end;
$$;

revoke all on function public.fn_cierre_reabrir(uuid, text) from public, anon;
grant execute on function public.fn_cierre_reabrir(uuid, text) to authenticated, service_role;
