-- Configuración de los estados financieros: atributos de flujo por cuenta, políticas
-- del Contador, notas y certificación. Porta la idea de financial_report_* del PR 460,
-- cuyas migraciones nunca llegaron a esta base.
--
-- Aditiva: no toca chart_of_accounts, asientos ni saldos. Sin backfill: ninguna cuenta
-- queda marcada por suposición. La propuesta «11 = efectivo» se calcula al leer y no se
-- guarda (ver fn_ef_atributos); lo demás queda pendiente hasta que el Contador lo marque.

create table if not exists public.financial_report_settings (
  organization_id integer primary key references public.organizations(id) on delete cascade,
  version integer not null default 1 check (version > 0),
  notas jsonb not null default '{}'::jsonb check (jsonb_typeof(notas) = 'object'),
  certificacion jsonb not null default '{}'::jsonb check (jsonb_typeof(certificacion) = 'object'),
  politicas_flujo jsonb not null default '{}'::jsonb check (jsonb_typeof(politicas_flujo) = 'object'),
  politicas_confirmadas_por uuid references auth.users(id),
  politicas_confirmadas_en timestamptz,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- Una marca en una cuenta de título la heredan sus auxiliares; manda la del prefijo más largo.
create table if not exists public.financial_report_account_metadata (
  organization_id integer not null,
  account_code text not null,
  clase_efectivo text check (clase_efectivo in ('efectivo', 'equivalente', 'restringido', 'no_efectivo')),
  categoria_flujo text check (categoria_flujo in ('operacion', 'inversion', 'financiacion', 'efecto_cambiario')),
  plazo_meses numeric check (plazo_meses between 0 and 1200),
  es_ori boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (organization_id, account_code),
  foreign key (organization_id, account_code)
    references public.chart_of_accounts(organization_id, account_code) on delete cascade,
  constraint fr_cuenta_clase_solo_activo check (clase_efectivo is null or left(account_code, 1) = '1'),
  constraint fr_cuenta_equivalente_plazo check (clase_efectivo is distinct from 'equivalente' or (plazo_meses is not null and plazo_meses <= 3)),
  constraint fr_cuenta_ori_38 check (not es_ori or replace(account_code, '-', '') like '38%')
);

create table if not exists public.financial_report_config_audit (
  id bigint generated always as identity primary key,
  organization_id integer not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id),
  changed_at timestamptz not null default now(),
  detalle jsonb not null
);
create index if not exists financial_report_config_audit_org_fecha
  on public.financial_report_config_audit(organization_id, changed_at desc);

alter table public.financial_report_settings enable row level security;
alter table public.financial_report_account_metadata enable row level security;
alter table public.financial_report_config_audit enable row level security;

revoke all on public.financial_report_settings, public.financial_report_account_metadata,
  public.financial_report_config_audit from public, anon, authenticated;
grant select on public.financial_report_settings, public.financial_report_account_metadata,
  public.financial_report_config_audit to authenticated;
grant all on public.financial_report_settings, public.financial_report_account_metadata,
  public.financial_report_config_audit to service_role;

drop policy if exists fr_settings_lectura on public.financial_report_settings;
create policy fr_settings_lectura on public.financial_report_settings
  for select to authenticated using (public.fn_tiene_permiso(organization_id, 'finance.view'));
drop policy if exists fr_cuentas_lectura on public.financial_report_account_metadata;
create policy fr_cuentas_lectura on public.financial_report_account_metadata
  for select to authenticated using (public.fn_tiene_permiso(organization_id, 'finance.view'));
drop policy if exists fr_auditoria_lectura on public.financial_report_config_audit;
create policy fr_auditoria_lectura on public.financial_report_config_audit
  for select to authenticated using (public.fn_tiene_permiso(organization_id, 'finance.approve'));

-- Políticas vigentes: lo guardado sobre los valores por defecto de NIIF para pymes 7.14 a 7.17.
-- Los valores por defecto son un punto de partida; la decisión es del Contador y la pantalla
-- lo dice hasta que queden confirmadas.
create or replace function public.fn_ef_politicas(p_organization_id integer)
returns jsonb language sql stable set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'intereses_pagados', 'operacion', 'intereses_recibidos', 'operacion',
    'dividendos_recibidos', 'operacion', 'dividendos_pagados', 'financiacion',
    'impuestos', 'operacion'
  ) || coalesce((select s.politicas_flujo from public.financial_report_settings s
                  where s.organization_id = p_organization_id), '{}'::jsonb);
$$;
revoke all on function public.fn_ef_politicas(integer) from public, anon, authenticated;
grant execute on function public.fn_ef_politicas(integer) to service_role;

create or replace function public.fn_ef_validar_texto(p_valor jsonb, p_maximo integer)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select coalesce(jsonb_typeof(p_valor) = 'string' and length(p_valor #>> '{}') <= p_maximo, false);
$$;
revoke all on function public.fn_ef_validar_texto(jsonb, integer) from public, anon, authenticated;
grant execute on function public.fn_ef_validar_texto(jsonb, integer) to service_role;

-- Guarda notas, certificación y políticas. Control de versión: quien guarda sobre una
-- versión vieja recibe 40001 y no pisa la edición de otra persona.
create or replace function public.fn_estados_configuracion_guardar(p_organization_id integer, p_cambios jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_version integer;
  v_clave text;
  v_valor jsonb;
  v_pol jsonb;
  v_confirma boolean;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if v_uid is not null and not public.fn_tiene_permiso(p_organization_id, 'finance.approve') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if jsonb_typeof(p_cambios) is distinct from 'object' or octet_length(p_cambios::text) > 500000 then
    raise exception 'configuracion_invalida' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_object_keys(p_cambios) k
              where k not in ('version', 'notas', 'certificacion', 'politicas_flujo', 'confirmar_politicas')) then
    raise exception 'configuracion_invalida' using errcode = '22023';
  end if;
  v_confirma := coalesce(p_cambios -> 'confirmar_politicas' = 'true'::jsonb, false);

  if p_cambios ? 'notas' then
    if jsonb_typeof(p_cambios -> 'notas') is distinct from 'object' then
      raise exception 'notas_invalidas' using errcode = '22023';
    end if;
    for v_clave, v_valor in select key, value from jsonb_each(p_cambios -> 'notas') loop
      if v_clave not in ('entidad', 'politicas', 'efectivo', 'deudores', 'inventarios', 'ppe')
         or jsonb_typeof(v_valor) is distinct from 'object'
         or not public.fn_ef_validar_texto(v_valor -> 'texto', 20000)
         or jsonb_typeof(v_valor -> 'revisada') is distinct from 'boolean' then
        raise exception 'notas_invalidas' using errcode = '22023';
      end if;
    end loop;
  end if;

  if p_cambios ? 'certificacion' then
    v_valor := p_cambios -> 'certificacion';
    if jsonb_typeof(v_valor) is distinct from 'object'
       or exists (select 1 from jsonb_object_keys(v_valor) k
                   where k not in ('representante_nombre', 'representante_cedula', 'contador_nombre',
                                   'contador_cedula', 'contador_tarjeta', 'texto', 'texto_validado'))
       or exists (select 1 from jsonb_each(v_valor) e
                   where e.key not in ('texto', 'texto_validado') and not public.fn_ef_validar_texto(e.value, 200))
       or (v_valor ? 'texto' and not public.fn_ef_validar_texto(v_valor -> 'texto', 5000))
       or (v_valor ? 'texto_validado' and jsonb_typeof(v_valor -> 'texto_validado') is distinct from 'boolean') then
      raise exception 'certificacion_invalida' using errcode = '22023';
    end if;
  end if;

  if p_cambios ? 'politicas_flujo' then
    v_pol := p_cambios -> 'politicas_flujo';
    if jsonb_typeof(v_pol) is distinct from 'object'
       or exists (select 1 from jsonb_each_text(v_pol) e
                   where not (
                     (e.key = 'intereses_pagados' and e.value in ('operacion', 'financiacion'))
                     or (e.key in ('intereses_recibidos', 'dividendos_recibidos') and e.value in ('operacion', 'inversion'))
                     or (e.key = 'dividendos_pagados' and e.value in ('financiacion', 'operacion'))
                     or (e.key = 'impuestos' and e.value = 'operacion')
                   )) then
      raise exception 'politicas_invalidas' using errcode = '22023';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('financial_report_settings:' || p_organization_id::text, 0));
  select s.version into v_version from public.financial_report_settings s
   where s.organization_id = p_organization_id for update;
  if not (p_cambios ? 'version') or (p_cambios ->> 'version') !~ '^[0-9]+$'
     or (p_cambios ->> 'version')::integer <> coalesce(v_version, 0) then
    raise exception 'version_obsoleta' using errcode = '40001';
  end if;

  insert into public.financial_report_settings as s (
    organization_id, notas, certificacion, politicas_flujo,
    politicas_confirmadas_por, politicas_confirmadas_en, updated_by, updated_at
  ) values (
    p_organization_id,
    coalesce(p_cambios -> 'notas', '{}'::jsonb),
    coalesce(p_cambios -> 'certificacion', '{}'::jsonb),
    coalesce(v_pol, '{}'::jsonb),
    case when v_confirma then v_uid end,
    case when v_confirma then now() end,
    v_uid, now()
  )
  on conflict (organization_id) do update set
    version = s.version + 1,
    notas = s.notas || coalesce(p_cambios -> 'notas', '{}'::jsonb),
    certificacion = s.certificacion || coalesce(p_cambios -> 'certificacion', '{}'::jsonb),
    politicas_flujo = s.politicas_flujo || coalesce(v_pol, '{}'::jsonb),
    -- Cambiar una política sin confirmarla deja la decisión otra vez pendiente.
    politicas_confirmadas_por = case
      when v_confirma then v_uid
      when v_pol is not null then null else s.politicas_confirmadas_por end,
    politicas_confirmadas_en = case
      when v_confirma then now()
      when v_pol is not null then null else s.politicas_confirmadas_en end,
    updated_by = v_uid, updated_at = now()
  returning s.version into v_version;

  insert into public.financial_report_config_audit (organization_id, user_id, detalle)
  values (p_organization_id, v_uid, jsonb_build_object(
    'version', v_version, 'notas', p_cambios ? 'notas', 'certificacion', p_cambios ? 'certificacion',
    'politicas', v_pol, 'confirmadas', v_confirma));
  return jsonb_build_object('version', v_version);
end;
$$;
revoke all on function public.fn_estados_configuracion_guardar(integer, jsonb) from public, anon;
grant execute on function public.fn_estados_configuracion_guardar(integer, jsonb) to authenticated, service_role;

-- Marca cuentas una por una: lo que el Contador decide. Todo en nulo borra la marca.
create or replace function public.fn_estados_cuentas_flujo_guardar(p_organization_id integer, p_cuentas jsonb)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_cuenta jsonb;
  v_codigo text;
  v_n integer := 0;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  if v_uid is not null and not public.fn_tiene_permiso(p_organization_id, 'finance.approve') then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;
  if jsonb_typeof(p_cuentas) is distinct from 'array' or jsonb_array_length(p_cuentas) > 2000 then
    raise exception 'cuentas_invalidas' using errcode = '22023';
  end if;
  for v_cuenta in select value from jsonb_array_elements(p_cuentas) loop
    v_codigo := v_cuenta ->> 'account_code';
    if jsonb_typeof(v_cuenta) is distinct from 'object' or not exists (
      select 1 from public.chart_of_accounts c
       where c.organization_id = p_organization_id and c.account_code = v_codigo
    ) then
      raise exception 'cuenta_no_pertenece_organizacion' using errcode = '22023';
    end if;
    if (v_cuenta ->> 'clase_efectivo') is null and (v_cuenta ->> 'categoria_flujo') is null
       and (v_cuenta ->> 'plazo_meses') is null and coalesce((v_cuenta ->> 'es_ori')::boolean, false) = false then
      delete from public.financial_report_account_metadata m
       where m.organization_id = p_organization_id and m.account_code = v_codigo;
    else
      insert into public.financial_report_account_metadata as m (
        organization_id, account_code, clase_efectivo, categoria_flujo, plazo_meses, es_ori, updated_by, updated_at
      ) values (
        p_organization_id, v_codigo, v_cuenta ->> 'clase_efectivo', v_cuenta ->> 'categoria_flujo',
        (v_cuenta ->> 'plazo_meses')::numeric, coalesce((v_cuenta ->> 'es_ori')::boolean, false), v_uid, now()
      )
      on conflict (organization_id, account_code) do update set
        clase_efectivo = excluded.clase_efectivo, categoria_flujo = excluded.categoria_flujo,
        plazo_meses = excluded.plazo_meses, es_ori = excluded.es_ori,
        updated_by = v_uid, updated_at = now();
    end if;
    v_n := v_n + 1;
  end loop;
  insert into public.financial_report_config_audit (organization_id, user_id, detalle)
  values (p_organization_id, v_uid, jsonb_build_object('cuentas_flujo', p_cuentas));
  return jsonb_build_object('cuentas', v_n);
end;
$$;
revoke all on function public.fn_estados_cuentas_flujo_guardar(integer, jsonb) from public, anon;
grant execute on function public.fn_estados_cuentas_flujo_guardar(integer, jsonb) to authenticated, service_role;
