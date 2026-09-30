-- Reportes v2: cierres de periodo congelados, numerados y con versiones
-- (Figma, página 14 Reportes, diálogo «Generar cierre» y pestaña Cierres;
-- página 09 Documentos, sección «Cierre de periodo consolidado»).
--
-- En la v1 el cierre corría en el navegador, se guardaba en report_executions
-- con solo los KPIs y, al descargarlo otra vez, el PDF se regeneraba con los
-- datos del momento y con otro número. El número salía de contar filas del
-- mes de created_at (carrera, y diciembre buscaba el mes 13).
--
-- report_closings
--   Un cierre por fila y versión. snapshot guarda todo lo que pinta el
--   documento (reportes, KPIs, tablas, vistas, lectura), así que descargarlo
--   otra vez da el mismo documento con el mismo número. Estados:
--     emitido      vigente, se puede recalcular o firmar;
--     firmado      vigente y firmado; el mensual o anual consolidado cierra el
--                  periodo contable (fiscal_periods);
--     reemplazado  lo sustituyó una versión nueva (reemplazado_por).
--   'borrador' queda en el CHECK para una vista previa guardada; hoy la vista
--   previa no se guarda.
--   Nada se borra: recalcular crea v2, v3… con el mismo número.
--
-- report_closing_counters
--   Numeración sin carrera: insert … on conflict do update … returning.
--   Formato CIERRE-<TIPO>-<AAAAMM>-<NNN>, con el mes de fecha_inicio. Se
--   siembra con los cierres de la v1 (report_executions 'cierre-<tipo>', 7
--   filas al aplicar) para no repetir números ya impresos.
--
-- Escritura solo por funciones:
--   fn_cierre_guardar  solo service_role. La llama la ruta del servidor
--                      después de validar sesión, organización, permiso y
--                      sucursal, con el snapshot que calculó ella misma: nadie
--                      puede guardar cifras que no salieron de los reportes.
--   fn_cierre_firmar   finance.approve y alcance de la sucursal del cierre.
--   fn_cierre_reabrir  accounting.reverse, con motivo; reabre el periodo.
-- Cada una deja su evento en report_executions (accion emitir, recalcular,
-- firmar o reabrir), que es la auditoría de la pestaña Historial.
--
-- Lectura: miembros activos de la organización, con el alcance de sucursal de
-- los reportes (reporte_alcance_permite): el consolidado solo lo ve quien tiene
-- acceso a todas las sucursales.

create table if not exists public.report_closings (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  numero text not null,
  version integer not null default 1 check (version >= 1),
  tipo text not null check (tipo in (
    'diario', 'semanal', 'quincenal', 'mensual',
    'trimestral', 'semestral', 'anual', 'personalizado'
  )),
  plantilla text not null default 'completo' check (plantilla in (
    'completo', 'contable', 'ventas-caja', 'personalizada'
  )),
  fecha_inicio date not null,
  fecha_fin date not null,
  hora_inicio time,
  hora_fin time,
  branch_id integer references public.branches(id) on delete restrict,
  reportes text[] not null default '{}'::text[],
  snapshot jsonb not null default '{}'::jsonb,
  idioma text not null default 'es',
  zona_horaria text,
  estado text not null default 'emitido' check (estado in (
    'borrador', 'emitido', 'firmado', 'reemplazado'
  )),
  reemplaza_a uuid references public.report_closings(id),
  reemplazado_por uuid references public.report_closings(id),
  emitido_por uuid references auth.users(id),
  emitido_en timestamptz not null default now(),
  firmado_por uuid references auth.users(id),
  firmado_en timestamptz,
  fiscal_period_id uuid references public.fiscal_periods(id) on delete set null,
  reabierto_por uuid references auth.users(id),
  reabierto_en timestamptz,
  motivo_reapertura text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_closings_fechas_check check (fecha_fin >= fecha_inicio),
  constraint report_closings_franja_check check ((hora_inicio is null) = (hora_fin is null)),
  constraint report_closings_numero_version_key unique (organization_id, numero, version)
);

create index if not exists idx_report_closings_org_fecha
  on public.report_closings (organization_id, fecha_inicio desc, created_at desc);
create index if not exists idx_report_closings_branch
  on public.report_closings (branch_id) where branch_id is not null;
create index if not exists idx_report_closings_reemplaza
  on public.report_closings (reemplaza_a) where reemplaza_a is not null;
create index if not exists idx_report_closings_reemplazado_por
  on public.report_closings (reemplazado_por) where reemplazado_por is not null;
create index if not exists idx_report_closings_fiscal_period
  on public.report_closings (fiscal_period_id) where fiscal_period_id is not null;

alter table public.report_closings enable row level security;

drop policy if exists report_closings_lectura on public.report_closings;
create policy report_closings_lectura on public.report_closings
  for select to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active = true
    )
    and public.reporte_alcance_permite(organization_id, branch_id)
  );

revoke insert, update, delete, truncate on public.report_closings from anon, authenticated;
revoke all on public.report_closings from anon;
grant select on public.report_closings to authenticated;

create table if not exists public.report_closing_counters (
  organization_id integer not null references public.organizations(id) on delete cascade,
  prefijo text not null,
  ultimo integer not null default 0 check (ultimo >= 0),
  updated_at timestamptz not null default now(),
  primary key (organization_id, prefijo)
);

alter table public.report_closing_counters enable row level security;
revoke all on public.report_closing_counters from anon, authenticated;

insert into public.report_closing_counters (organization_id, prefijo, ultimo)
select re.organization_id,
       'CIERRE-' || upper(substr(re.report_id, 8)) || '-'
         || replace(substr(re.params -> 'periodo' ->> 'fechaInicio', 1, 7), '-', ''),
       count(*)::integer
from public.report_executions re
where re.report_id like 'cierre-%'
  and (re.params -> 'periodo' ->> 'fechaInicio') ~ '^\d{4}-\d{2}-\d{2}'
group by 1, 2
on conflict (organization_id, prefijo) do update
  set ultimo = greatest(public.report_closing_counters.ultimo, excluded.ultimo);

-- Evento de auditoría de un cierre (interno; lo llaman las tres funciones).
create or replace function public.fn_cierre_evento(
  p_cierre public.report_closings,
  p_usuario uuid,
  p_accion text,
  p_extra jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  insert into public.report_executions (
    organization_id, user_id, executed_by, module, status, report_id,
    accion, branch_id, params, row_count
  ) values (
    p_cierre.organization_id, p_usuario, p_usuario, 'cierres', 'completed',
    'cierre-' || p_cierre.tipo, p_accion, p_cierre.branch_id,
    jsonb_build_object(
      'cierre_id', p_cierre.id,
      'numero', p_cierre.numero,
      'version', p_cierre.version,
      'fecha_inicio', p_cierre.fecha_inicio,
      'fecha_fin', p_cierre.fecha_fin,
      'hora_inicio', p_cierre.hora_inicio,
      'hora_fin', p_cierre.hora_fin,
      'plantilla', p_cierre.plantilla
    ) || coalesce(p_extra, '{}'::jsonb),
    coalesce(cardinality(p_cierre.reportes), 0)
  );
$$;

revoke all on function public.fn_cierre_evento(public.report_closings, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.fn_cierre_evento(public.report_closings, uuid, text, jsonb) to service_role;

-- Guarda un cierre emitido (o su versión nueva si p_reemplaza no es NULL).
-- p_datos: tipo, plantilla, fecha_inicio, fecha_fin, hora_inicio, hora_fin,
-- branch_id, reportes (text[]), snapshot, idioma, zona_horaria.
create or replace function public.fn_cierre_guardar(
  p_organization_id bigint,
  p_usuario uuid,
  p_datos jsonb,
  p_reemplaza uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tipo text := p_datos ->> 'tipo';
  v_inicio date := (p_datos ->> 'fecha_inicio')::date;
  v_fin date := (p_datos ->> 'fecha_fin')::date;
  v_hora_ini time := nullif(p_datos ->> 'hora_inicio', '')::time;
  v_hora_fin time := nullif(p_datos ->> 'hora_fin', '')::time;
  v_branch integer := nullif(p_datos ->> 'branch_id', '')::integer;
  v_anterior public.report_closings;
  v_existente uuid;
  v_numero text;
  v_version integer := 1;
  v_prefijo text;
  v_seq integer;
  v_nuevo public.report_closings;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'solo_servidor' using errcode = '42501';
  end if;

  if p_usuario is null or not exists (
    select 1 from public.organization_members om
    where om.user_id = p_usuario
      and om.organization_id = p_organization_id
      and om.is_active = true
  ) then
    raise exception 'ORG_FORBIDDEN' using errcode = '42501';
  end if;

  if v_branch is not null and not exists (
    select 1 from public.branches b
    where b.id = v_branch and b.organization_id = p_organization_id
  ) then
    raise exception 'BRANCH_FORBIDDEN' using errcode = '42501';
  end if;

  if v_tipo is null or v_inicio is null or v_fin is null then
    raise exception 'cierre_incompleto' using errcode = '22023';
  end if;

  if p_reemplaza is not null then
    select * into v_anterior
    from public.report_closings rc
    where rc.id = p_reemplaza and rc.organization_id = p_organization_id
    for update;

    if v_anterior.id is null then
      raise exception 'cierre_no_encontrado' using errcode = 'P0002';
    end if;
    if v_anterior.estado = 'firmado' then
      raise exception 'cierre_firmado' using errcode = '55000',
        hint = 'Reabre el periodo antes de recalcular.';
    end if;
    if v_anterior.estado <> 'emitido' then
      raise exception 'cierre_reemplazado' using errcode = '55000';
    end if;
    if v_anterior.tipo <> v_tipo or v_anterior.fecha_inicio <> v_inicio
       or v_anterior.fecha_fin <> v_fin
       or v_anterior.branch_id is distinct from v_branch then
      raise exception 'cierre_distinto_periodo' using errcode = '22023';
    end if;

    v_numero := v_anterior.numero;
    select coalesce(max(rc.version), 0) + 1 into v_version
    from public.report_closings rc
    where rc.organization_id = p_organization_id and rc.numero = v_numero;
  else
    select rc.id into v_existente
    from public.report_closings rc
    where rc.organization_id = p_organization_id
      and rc.tipo = v_tipo
      and rc.fecha_inicio = v_inicio
      and rc.fecha_fin = v_fin
      and rc.branch_id is not distinct from v_branch
      and rc.hora_inicio is not distinct from v_hora_ini
      and rc.hora_fin is not distinct from v_hora_fin
      and rc.estado in ('emitido', 'firmado')
    limit 1;

    if v_existente is not null then
      raise exception 'cierre_existente' using errcode = '23505',
        detail = v_existente::text,
        hint = 'Recalcula el cierre vigente para crear una versión nueva.';
    end if;

    v_prefijo := 'CIERRE-' || upper(v_tipo) || '-' || to_char(v_inicio, 'YYYYMM');
    insert into public.report_closing_counters as c (organization_id, prefijo, ultimo)
    values (p_organization_id, v_prefijo, 1)
    on conflict (organization_id, prefijo) do update
      set ultimo = c.ultimo + 1, updated_at = now()
    returning c.ultimo into v_seq;

    v_numero := v_prefijo || '-' || lpad(v_seq::text, 3, '0');
  end if;

  insert into public.report_closings (
    organization_id, numero, version, tipo, plantilla,
    fecha_inicio, fecha_fin, hora_inicio, hora_fin, branch_id,
    reportes, snapshot, idioma, zona_horaria, estado, reemplaza_a,
    emitido_por, emitido_en
  ) values (
    p_organization_id, v_numero, v_version, v_tipo,
    coalesce(p_datos ->> 'plantilla', 'completo'),
    v_inicio, v_fin, v_hora_ini, v_hora_fin, v_branch,
    coalesce(
      (select array_agg(x) from jsonb_array_elements_text(p_datos -> 'reportes') x),
      '{}'::text[]
    ),
    coalesce(p_datos -> 'snapshot', '{}'::jsonb),
    coalesce(nullif(p_datos ->> 'idioma', ''), 'es'),
    nullif(p_datos ->> 'zona_horaria', ''),
    'emitido', p_reemplaza, p_usuario, now()
  )
  returning * into v_nuevo;

  if p_reemplaza is not null then
    update public.report_closings
       set estado = 'reemplazado', reemplazado_por = v_nuevo.id, updated_at = now()
     where id = p_reemplaza;
  end if;

  perform public.fn_cierre_evento(
    v_nuevo, p_usuario,
    case when p_reemplaza is null then 'emitir' else 'recalcular' end,
    case when p_reemplaza is null then '{}'::jsonb
         else jsonb_build_object('reemplaza_a', p_reemplaza) end
  );

  return jsonb_build_object(
    'id', v_nuevo.id,
    'numero', v_nuevo.numero,
    'version', v_nuevo.version,
    'estado', v_nuevo.estado
  );
end;
$$;

revoke all on function public.fn_cierre_guardar(bigint, uuid, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.fn_cierre_guardar(bigint, uuid, jsonb, uuid) to service_role;

-- Firma el cierre vigente. El mensual o anual consolidado (sin sucursal ni
-- franja, y que cubre el mes o el año completo) cierra el periodo contable.
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
    update public.fiscal_periods
       set status = 'closed', closed_by = v_uid, closed_at = now(),
           notes = concat_ws(E'\n', nullif(notes, ''), 'Cerrado al firmar ' || v_c.numero || ' v' || v_c.version)
     where id = v_periodo;
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

-- Reabre un cierre firmado: vuelve a «emitido» (se puede recalcular) y reabre
-- el periodo contable que cerró. Queda en la auditoría con el motivo.
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
    update public.fiscal_periods
       set status = 'open', closed_by = null, closed_at = null,
           notes = concat_ws(E'\n', nullif(notes, ''), 'Reabierto desde ' || v_c.numero || ' v' || v_c.version || ': ' || v_motivo)
     where id = v_c.fiscal_period_id;
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
