-- Configuración aditiva de informes contables. No se modifican asientos ni saldos.
-- presentacion_niif del PUC existente sigue siendo la única clasificación corriente/no corriente.
-- La versión se reservó manualmente: el CLI no pudo emitirla en el entorno de esta tarea.
create table if not exists public.financial_report_settings (
  organization_id integer primary key references public.organizations(id),
  version integer not null default 1 check (version > 0),
  grupo_niif smallint not null default 2 check (grupo_niif in (2,3)),
  presenta_cambios_patrimonio boolean not null default true,
  notas jsonb not null default '{}'::jsonb check (jsonb_typeof(notas) = 'object'),
  certificacion jsonb not null default '{}'::jsonb check (jsonb_typeof(certificacion) = 'object'),
  parametros_fiscales jsonb not null default '{}'::jsonb check (jsonb_typeof(parametros_fiscales) = 'object'),
  anotaciones_asientos jsonb not null default '{}'::jsonb check (jsonb_typeof(anotaciones_asientos) = 'object'),
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
create table if not exists public.financial_report_account_metadata (
  organization_id integer not null references public.organizations(id),
  account_code text not null,
  costo_comportamiento text check (costo_comportamiento in ('fijo','variable')),
  es_ori boolean not null default false,
  equivalente_efectivo boolean not null default false,
  plazo_meses numeric check (plazo_meses between 0 and 1200),
  primary key (organization_id, account_code),
  foreign key (organization_id, account_code) references public.chart_of_accounts(organization_id, account_code),
  check (not es_ori or replace(account_code,'-','') like '38%'),
  check (not equivalente_efectivo or (replace(account_code,'-','') like '12%' and plazo_meses is not null and plazo_meses <= 3))
);
create table if not exists public.financial_report_config_audit (
  id bigint generated always as identity primary key,
  organization_id integer not null references public.organizations(id),
  user_id uuid not null references auth.users(id),
  changed_at timestamptz not null default now(),
  detalle jsonb not null
);
create index if not exists financial_report_config_audit_org_fecha
  on public.financial_report_config_audit(organization_id, changed_at desc);
alter table public.financial_report_settings enable row level security;
alter table public.financial_report_account_metadata enable row level security;
alter table public.financial_report_config_audit enable row level security;
revoke all on public.financial_report_settings, public.financial_report_account_metadata, public.financial_report_config_audit from anon, authenticated;
grant select on public.financial_report_settings, public.financial_report_account_metadata, public.financial_report_config_audit to authenticated;
grant all on public.financial_report_settings, public.financial_report_account_metadata, public.financial_report_config_audit to service_role;

drop policy if exists informes_config_lectura on public.financial_report_settings;
create policy informes_config_lectura on public.financial_report_settings for select to authenticated using (
  exists(select 1 from public.organization_members m where m.organization_id=financial_report_settings.organization_id and m.user_id=(select auth.uid()) and m.is_active)
  and (public.check_user_permission((select auth.uid()),organization_id,'finance.view') or public.check_user_permission((select auth.uid()),organization_id,'reports.finance') or public.check_user_permission((select auth.uid()),organization_id,'finance.approve'))
);
drop policy if exists informes_cuentas_lectura on public.financial_report_account_metadata;
create policy informes_cuentas_lectura on public.financial_report_account_metadata for select to authenticated using (
  exists(select 1 from public.organization_members m where m.organization_id=financial_report_account_metadata.organization_id and m.user_id=(select auth.uid()) and m.is_active)
  and (public.check_user_permission((select auth.uid()),organization_id,'finance.view') or public.check_user_permission((select auth.uid()),organization_id,'reports.finance') or public.check_user_permission((select auth.uid()),organization_id,'finance.approve'))
);
drop policy if exists informes_config_auditoria_lectura on public.financial_report_config_audit;
create policy informes_config_auditoria_lectura on public.financial_report_config_audit for select to authenticated using (
  exists(select 1 from public.organization_members m where m.organization_id=financial_report_config_audit.organization_id and m.user_id=(select auth.uid()) and m.is_active)
  and public.check_user_permission((select auth.uid()),organization_id,'finance.approve')
);

create or replace function public.fn_guardar_configuracion_informes(p_organization_id integer,p_configuracion jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_usuario uuid := auth.uid();
  v_version integer;
  v_cuenta jsonb;
  v_anotacion record;
  v_clasificacion_anterior text;
  v_clasificaciones_modificadas jsonb := '[]'::jsonb;
begin
  if v_usuario is null
    or not exists(select 1 from public.organization_members m where m.organization_id=p_organization_id and m.user_id=v_usuario and m.is_active)
    or not coalesce(public.check_user_permission(v_usuario,p_organization_id,'finance.approve'),false) then
    raise exception 'sin_permiso' using errcode='42501';
  end if;
  if jsonb_typeof(p_configuracion) is distinct from 'object' or octet_length(p_configuracion::text)>2000000
    or not (p_configuracion ? 'grupo_niif') or p_configuracion->>'grupo_niif' not in ('2','3')
    or jsonb_typeof(p_configuracion->'presenta_cambios_patrimonio') is distinct from 'boolean'
    or jsonb_typeof(p_configuracion->'notas') is distinct from 'object'
    or jsonb_typeof(p_configuracion->'certificacion') is distinct from 'object'
    or jsonb_typeof(p_configuracion->'cuentas') is distinct from 'array'
    or (p_configuracion ? 'parametros_fiscales' and jsonb_typeof(p_configuracion->'parametros_fiscales') is distinct from 'object')
    or (p_configuracion ? 'anotaciones_asientos' and jsonb_typeof(p_configuracion->'anotaciones_asientos') is distinct from 'object') then
    raise exception 'configuracion_invalida' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_each(p_configuracion->'notas') n where n.key not in ('entidad','basesPreparacion','politicas','revelaciones') or jsonb_typeof(n.value) is distinct from 'string')
    or jsonb_typeof(p_configuracion#>'{certificacion,entidad}') is distinct from 'string'
    or jsonb_typeof(p_configuracion#>'{certificacion,nit}') is distinct from 'string'
    or jsonb_typeof(p_configuracion#>'{certificacion,representante,nombre}') is distinct from 'string'
    or jsonb_typeof(p_configuracion#>'{certificacion,representante,cedula}') is distinct from 'string'
    or jsonb_typeof(p_configuracion#>'{certificacion,contador,nombre}') is distinct from 'string'
    or jsonb_typeof(p_configuracion#>'{certificacion,contador,cedula}') is distinct from 'string' then
    raise exception 'textos_configuracion_invalidos' using errcode='22023';
  end if;
  -- Serializa también el primer guardado, cuando aún no existe la fila de configuración.
  perform pg_advisory_xact_lock(hashtextextended('financial_report_settings:' || p_organization_id::text,0));
  select version into v_version from public.financial_report_settings where organization_id=p_organization_id for update;
  if coalesce((p_configuracion->>'version')::integer,-1)<>coalesce(v_version,0) then
    raise exception 'version_configuracion_obsoleta' using errcode='40001';
  end if;
  if jsonb_array_length(p_configuracion->'cuentas')>10000 then raise exception 'demasiadas_cuentas' using errcode='22023'; end if;
  if (select count(*) from jsonb_array_elements(p_configuracion->'cuentas'))<>(select count(distinct value->>'account_code') from jsonb_array_elements(p_configuracion->'cuentas')) then
    raise exception 'cuentas_repetidas' using errcode='22023';
  end if;
  for v_cuenta in select value from jsonb_array_elements(p_configuracion->'cuentas') loop
    if jsonb_typeof(v_cuenta) is distinct from 'object'
      or not exists(select 1 from public.chart_of_accounts a where a.organization_id=p_organization_id and a.account_code=v_cuenta->>'account_code') then
      raise exception 'cuenta_no_pertenece_organizacion' using errcode='22023';
    end if;
    if jsonb_typeof(v_cuenta->'es_ori') is distinct from 'boolean' or jsonb_typeof(v_cuenta->'equivalente_efectivo') is distinct from 'boolean' then
      raise exception 'marca_invalida' using errcode='22023';
    end if;
    if v_cuenta ? 'clasificacion_corriente' then
      if v_cuenta->>'clasificacion_corriente' is not null and v_cuenta->>'clasificacion_corriente' not in ('corriente','no_corriente','segun_plazo') then
        raise exception 'clasificacion_invalida' using errcode='22023';
      end if;
      select a.presentacion_niif into v_clasificacion_anterior from public.chart_of_accounts a
        where a.organization_id=p_organization_id and a.account_code=v_cuenta->>'account_code' for update;
      -- Alias API del campo existente. La UI omite la clave al editar solo ORI/costo/plazo.
      -- Se conserva el código real, incluido el guion de auxiliares históricos, para el FK.
      if v_clasificacion_anterior is distinct from v_cuenta->>'clasificacion_corriente' then
        update public.chart_of_accounts set presentacion_niif=v_cuenta->>'clasificacion_corriente'
          where organization_id=p_organization_id and account_code=v_cuenta->>'account_code';
        v_clasificaciones_modificadas:=v_clasificaciones_modificadas||jsonb_build_array(jsonb_build_object('account_code',v_cuenta->>'account_code','antes',v_clasificacion_anterior,'despues',v_cuenta->'clasificacion_corriente'));
      end if;
    end if;
    insert into public.financial_report_account_metadata(organization_id,account_code,costo_comportamiento,es_ori,equivalente_efectivo,plazo_meses)
      values(p_organization_id,v_cuenta->>'account_code',v_cuenta->>'costo_comportamiento',(v_cuenta->>'es_ori')::boolean,(v_cuenta->>'equivalente_efectivo')::boolean,(v_cuenta->>'plazo_meses')::numeric)
      on conflict(organization_id,account_code) do update set costo_comportamiento=excluded.costo_comportamiento,es_ori=excluded.es_ori,equivalente_efectivo=excluded.equivalente_efectivo,plazo_meses=excluded.plazo_meses;
  end loop;
  if p_configuracion ? 'anotaciones_asientos' then
    for v_anotacion in select key,value from jsonb_each(p_configuracion->'anotaciones_asientos') loop
      if v_anotacion.key !~ '^[1-9][0-9]{0,9}$' or jsonb_typeof(v_anotacion.value) is distinct from 'object' then raise exception 'anotacion_invalida' using errcode='22023'; end if;
      if not exists(select 1 from public.journal_entries e where e.id::bigint=v_anotacion.key::bigint and e.organization_id=p_organization_id and public.app_branch_access(e.branch_id)) then
        raise exception 'asiento_no_pertenece_alcance' using errcode='42501';
      end if;
      if (v_anotacion.value->>'concepto_patrimonio') is not null and (v_anotacion.value->>'concepto_patrimonio') not in ('aportes','dividendos_efectivo','dividendos_acciones','reservas','traslado_resultados','correccion_errores','ori') then raise exception 'concepto_invalido' using errcode='22023'; end if;
      if v_anotacion.value ? 'provision_sin_caja' and jsonb_typeof(v_anotacion.value->'provision_sin_caja') is distinct from 'boolean' then raise exception 'provision_invalida' using errcode='22023'; end if;
      if (v_anotacion.value->>'cash_flow_activity') is not null and (v_anotacion.value->>'cash_flow_activity') not in ('operacion','inversion','financiacion') then raise exception 'actividad_invalida' using errcode='22023'; end if;
    end loop;
  end if;
  insert into public.financial_report_settings(organization_id,version,grupo_niif,presenta_cambios_patrimonio,notas,certificacion,parametros_fiscales,anotaciones_asientos,updated_by,updated_at)
    values(p_organization_id,1,(p_configuracion->>'grupo_niif')::smallint,(p_configuracion->>'presenta_cambios_patrimonio')::boolean,p_configuracion->'notas',p_configuracion->'certificacion',coalesce(p_configuracion->'parametros_fiscales','{}'::jsonb),coalesce(p_configuracion->'anotaciones_asientos','{}'::jsonb),v_usuario,now())
    on conflict(organization_id) do update set version=financial_report_settings.version+1,grupo_niif=excluded.grupo_niif,presenta_cambios_patrimonio=excluded.presenta_cambios_patrimonio,notas=excluded.notas,certificacion=excluded.certificacion,
      parametros_fiscales=case when p_configuracion ? 'parametros_fiscales' then excluded.parametros_fiscales else financial_report_settings.parametros_fiscales end,
      anotaciones_asientos=case when p_configuracion ? 'anotaciones_asientos' then excluded.anotaciones_asientos else financial_report_settings.anotaciones_asientos end,
      updated_by=v_usuario,updated_at=now()
    returning version into v_version;
  insert into public.financial_report_config_audit(organization_id,user_id,detalle)
    values(p_organization_id,v_usuario,jsonb_build_object('version',v_version,'grupo_niif',p_configuracion->'grupo_niif','cuentas_modificadas',jsonb_array_length(p_configuracion->'cuentas'),'clasificaciones_modificadas',v_clasificaciones_modificadas,'anotaciones_modificadas',p_configuracion ? 'anotaciones_asientos','parametros_modificados',p_configuracion ? 'parametros_fiscales'));
  return jsonb_build_object('version',v_version);
end;
$$;
revoke all on function public.fn_guardar_configuracion_informes(integer,jsonb) from public,anon;
grant execute on function public.fn_guardar_configuracion_informes(integer,jsonb) to authenticated;

-- journal_reversals no admite lectura de authenticated. Se expone únicamente esta consulta
-- acotada por sesión, pertenencia, permiso financiero y alcance de las dos sucursales.
-- Devuelve un único jsonb para evitar el truncamiento de tablas de más de 1000 anulaciones
-- por el max_rows de PostgREST. No lee el borrador ni modifica originales/reversiones.
create or replace function public.fn_informes_anulaciones(p_organization_id integer,p_hasta timestamptz)
returns jsonb language plpgsql stable security definer set search_path=public,pg_temp as $$
declare
  v_usuario uuid:=auth.uid();
  v_resultado jsonb;
begin
  if v_usuario is null
    or not exists(select 1 from public.organization_members m where m.organization_id=p_organization_id and m.user_id=v_usuario and m.is_active)
    or not (coalesce(public.check_user_permission(v_usuario,p_organization_id,'finance.view'),false) or coalesce(public.check_user_permission(v_usuario,p_organization_id,'reports.finance'),false)) then
    raise exception 'sin_permiso' using errcode='42501';
  end if;
  if p_hasta is null or not isfinite(p_hasta) then raise exception 'corte_invalido' using errcode='22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'original_entry_id',r.original_entry_id,'reversal_entry_id',r.reversal_entry_id,
    'anulado_en',reversion.entry_date,
    'restaurado_en',case when restaurado.entry_date<=p_hasta then restaurado.entry_date else null end
  ) order by reversion.entry_date,r.id),'[]'::jsonb) into v_resultado
  from public.journal_reversals r
  join public.journal_entries original on original.id=r.original_entry_id and original.organization_id=r.organization_id and original.posted
  join public.journal_entries reversion on reversion.id=r.reversal_entry_id and reversion.organization_id=r.organization_id and reversion.posted
  left join public.journal_entries restaurado on restaurado.id=r.restored_entry_id and restaurado.organization_id=r.organization_id and restaurado.posted
  where r.organization_id=p_organization_id and reversion.entry_date<=p_hasta
    and public.app_branch_access(original.branch_id) and public.app_branch_access(reversion.branch_id)
    and (restaurado.id is null or public.app_branch_access(restaurado.branch_id));
  return v_resultado;
end;
$$;
revoke all on function public.fn_informes_anulaciones(integer,timestamptz) from public,anon;
grant execute on function public.fn_informes_anulaciones(integer,timestamptz) to authenticated;

-- Sin backfill: las organizaciones existentes conservan informes, asientos y clasificaciones.
-- Ausencia de configuración => grupo 2 y textos predeterminados en el lector, sin insertar filas.
