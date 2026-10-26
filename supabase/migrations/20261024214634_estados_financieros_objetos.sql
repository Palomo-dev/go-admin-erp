set local lock_timeout = '30s';
set local statement_timeout = '120s';

do $dep$
begin
  if to_regprocedure('public.reporte_exigir_alcance_sucursal(bigint,bigint)') is null then
    raise exception 'Falta reporte_exigir_alcance_sucursal.';
  end if;
  if to_regprocedure('public.fn_timezone_for(integer,integer)') is null then
    raise exception 'Falta fn_timezone_for.';
  end if;
  if to_regprocedure('public.monto_base_asiento(numeric,numeric,numeric)') is null then
    raise exception 'Falta monto_base_asiento.';
  end if;
  if to_regprocedure('public.check_user_permission(uuid,integer,text)') is null then
    raise exception 'Falta check_user_permission.';
  end if;
end
$dep$;

create table if not exists public.perfil_estados_financieros (
  organization_id integer primary key references public.organizations (id) on delete cascade,
  grupo_niif smallint not null default 2 check (grupo_niif in (2, 3)),
  cambios_patrimonio boolean not null default true,
  periodo_iva text not null default 'bimestral' check (periodo_iva in ('bimestral', 'cuatrimestral')),
  responsable_iva boolean not null default true,
  actividad text not null default '',
  municipio_ica text not null default '',
  tarifa_ica numeric not null default 0 check (tarifa_ica >= 0 and tarifa_ica <= 1),
  exclusiones_ica text not null default '',
  exclusiones_ica_valor numeric not null default 0 check (exclusiones_ica_valor >= 0),
  representante_nombre text not null default '',
  representante_documento text not null default '',
  contador_nombre text not null default '',
  contador_cedula text not null default '',
  contador_tarjeta text not null default '',
  revisor_nombre text not null default '',
  revisor_tarjeta text not null default '',
  incluir_dictamen boolean not null default false,
  notas jsonb not null default '{}'::jsonb,
  informe_gestion text not null default '',
  digitos_nota smallint not null default 4 check (digitos_nota in (4, 6)),
  updated_at timestamptz not null default now()
);

create table if not exists public.topes_exogena (
  organization_id integer not null references public.organizations (id) on delete cascade,
  anio integer not null check (anio between 2000 and 2100),
  formato text not null check (formato in ('1001', '1005', '1006', '1007', '1008', '1009')),
  tope numeric not null check (tope >= 0),
  primary key (organization_id, anio, formato)
);

create table if not exists public.accionistas_org (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations (id) on delete cascade,
  nombre text not null,
  documento text not null default '',
  acciones numeric not null default 0 check (acciones >= 0),
  valor_nominal numeric not null default 0 check (valor_nominal >= 0),
  porcentaje numeric not null default 0 check (porcentaje >= 0 and porcentaje <= 100),
  fecha_ingreso date
);

create index if not exists accionistas_org_organizacion_idx
  on public.accionistas_org (organization_id);

create table if not exists public.ajustes_conciliacion_fiscal (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations (id) on delete cascade,
  anio integer not null check (anio between 2000 and 2100),
  concepto text not null,
  tipo text not null check (tipo in ('adicion', 'deduccion')),
  valor numeric not null default 0,
  formulario text not null check (formulario in ('2516', '2517'))
);

create index if not exists ajustes_conciliacion_fiscal_organizacion_idx
  on public.ajustes_conciliacion_fiscal (organization_id, anio);

comment on table public.perfil_estados_financieros is
  'Grupo NIIF, firmas, ICA e IVA y textos de notas. Sin fila, el informe usa los valores por defecto y no cambia las cifras de los reportes anteriores.';
comment on table public.topes_exogena is
  'Tope de cuantías menores por organización, año y formato. No hay montos fijos en el código.';

alter table public.perfil_estados_financieros enable row level security;
alter table public.topes_exogena enable row level security;
alter table public.accionistas_org enable row level security;
alter table public.ajustes_conciliacion_fiscal enable row level security;

create or replace function public.fn_miembro_finanzas(p_organization_id integer, p_escribir boolean)
returns boolean
language sql
stable
security invoker
set search_path = public
as $fn$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = (select auth.uid())
      and m.is_active
  )
  and (
    public.check_user_permission((select auth.uid()), p_organization_id, 'finance.approve')
    or public.check_user_permission((select auth.uid()), p_organization_id, 'finance.edit')
    or (
      not p_escribir
      and (
        public.check_user_permission((select auth.uid()), p_organization_id, 'finance.view')
        or public.check_user_permission((select auth.uid()), p_organization_id, 'reports.finance')
      )
    )
  );
$fn$;

revoke all on function public.fn_miembro_finanzas(integer, boolean) from public, anon;
grant execute on function public.fn_miembro_finanzas(integer, boolean) to authenticated, service_role;

do $pol$
declare
  t text;
begin
  foreach t in array array[
    'perfil_estados_financieros',
    'topes_exogena',
    'accionistas_org',
    'ajustes_conciliacion_fiscal'
  ]
  loop
    execute format('drop policy if exists estados_lectura on public.%I', t);
    execute format('drop policy if exists estados_escritura on public.%I', t);
    execute format(
      'create policy estados_lectura on public.%I for select using (public.fn_miembro_finanzas(organization_id, false))',
      t
    );
    execute format(
      'create policy estados_escritura on public.%I for all using (public.fn_miembro_finanzas(organization_id, true)) with check (public.fn_miembro_finanzas(organization_id, true))',
      t
    );
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end
$pol$;

drop policy if exists estados_marca_escritura on public.financial_report_account_metadata;
create policy estados_marca_escritura
  on public.financial_report_account_metadata
  for all
  using (public.fn_miembro_finanzas(organization_id, true))
  with check (public.fn_miembro_finanzas(organization_id, true));

grant select, insert, update, delete on table public.financial_report_account_metadata to authenticated;

create or replace function public.fn_guardar_marca_informe(
  p_organization_id integer,
  p_account_code text,
  p_presentacion text,
  p_comportamiento text,
  p_es_ori boolean,
  p_equivalente boolean,
  p_plazo numeric
) returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_codigo text := replace(coalesce(p_account_code, ''), '-', '');
  v_presentacion text := nullif(p_presentacion, '');
  v_comportamiento text := nullif(p_comportamiento, '');
begin
  if not public.fn_miembro_finanzas(p_organization_id, true) then
    raise exception 'ORG_FORBIDDEN' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.chart_of_accounts c
    where c.organization_id = p_organization_id and c.account_code = p_account_code
  ) then
    raise exception 'La cuenta no está en el plan de la organización' using errcode = '23514';
  end if;
  if v_presentacion is not null and v_presentacion not in ('corriente', 'no_corriente', 'segun_plazo') then
    raise exception 'La presentación no es válida' using errcode = '23514';
  end if;
  if v_comportamiento is not null and v_comportamiento not in ('fijo', 'variable') then
    raise exception 'El comportamiento del costo no es válido' using errcode = '23514';
  end if;
  if p_es_ori and v_codigo not like '38%' then
    raise exception 'Solo un auxiliar de la 38 puede marcarse como ORI' using errcode = '23514';
  end if;
  if p_equivalente and (v_codigo not like '12%' or p_plazo is null or p_plazo > 3) then
    raise exception 'Un equivalente de efectivo es una inversión de la 12 a 3 meses o menos' using errcode = '23514';
  end if;

  update public.chart_of_accounts
     set presentacion_niif = v_presentacion
   where organization_id = p_organization_id
     and account_code = p_account_code;

  insert into public.financial_report_account_metadata (
    organization_id, account_code, costo_comportamiento, es_ori, equivalente_efectivo, plazo_meses
  ) values (
    p_organization_id, p_account_code, v_comportamiento, coalesce(p_es_ori, false), coalesce(p_equivalente, false), p_plazo
  )
  on conflict (organization_id, account_code) do update
    set costo_comportamiento = excluded.costo_comportamiento,
        es_ori = excluded.es_ori,
        equivalente_efectivo = excluded.equivalente_efectivo,
        plazo_meses = excluded.plazo_meses;
end;
$fn$;

revoke all on function public.fn_guardar_marca_informe(integer, text, text, text, boolean, boolean, numeric) from public, anon;
grant execute on function public.fn_guardar_marca_informe(integer, text, text, text, boolean, boolean, numeric) to authenticated, service_role;

create or replace function public.fn_movimientos_informe(
  p_organization_id integer,
  p_hasta date,
  p_sucursal integer default null,
  p_centro uuid default null,
  p_detalle_desde date default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
set statement_timeout = '120s'
as $fn$
declare
  v_tz text;
begin
  perform public.reporte_exigir_alcance_sucursal(p_organization_id::bigint, p_sucursal::bigint);
  v_tz := coalesce(public.fn_timezone_for(p_organization_id, p_sucursal), 'America/Bogota');

  return (
    with base as (
      select
        je.id as asiento_id,
        (je.entry_date at time zone v_tz)::date as fecha,
        jl.account_code as cuenta,
        public.monto_base_asiento(jl.debit, jl.debit_base, coalesce(jl.exchange_rate, je.exchange_rate)) as debito,
        public.monto_base_asiento(jl.credit, jl.credit_base, coalesce(jl.exchange_rate, je.exchange_rate)) as credito,
        je.branch_id as sucursal_id,
        jl.cost_center_id as centro_id,
        coalesce(jl.tercero_nit, '') as tercero_nit,
        coalesce(jl.tercero_nombre, '') as tercero_nombre,
        coalesce(je.source, '') as source
      from public.journal_lines jl
      join public.journal_entries je
        on je.id = jl.journal_entry_id
       and je.organization_id = jl.organization_id
      where jl.organization_id = p_organization_id
        and je.posted is true
        and coalesce(je.source, '') <> 'reversal'
        and (je.entry_date at time zone v_tz)::date <= p_hasta
        and (p_sucursal is null or je.branch_id = p_sucursal)
        and (p_centro is null or jl.cost_center_id = p_centro)
        and not exists (
          select 1
          from public.journal_reversals jr
          where jr.organization_id = p_organization_id
            and (jr.original_entry_id = je.id or jr.reversal_entry_id = je.id)
        )
    ),
    detalle as (
      select
        asiento_id, fecha, cuenta, sucursal_id, centro_id, tercero_nit, tercero_nombre, source,
        sum(debito) as debito, sum(credito) as credito
      from base
      where p_detalle_desde is null or fecha >= p_detalle_desde
      group by asiento_id, fecha, cuenta, sucursal_id, centro_id, tercero_nit, tercero_nombre, source
    ),
    apertura as (
      select
        -1 as asiento_id,
        (p_detalle_desde - 1) as fecha,
        cuenta, sucursal_id, centro_id, tercero_nit, tercero_nombre,
        'apertura' as source,
        sum(debito) as debito,
        sum(credito) as credito
      from base
      where p_detalle_desde is not null and fecha < p_detalle_desde
      group by cuenta, sucursal_id, centro_id, tercero_nit, tercero_nombre
      having sum(debito) <> 0 or sum(credito) <> 0
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'asientoId', asiento_id,
      'fecha', fecha,
      'cuenta', cuenta,
      'debito', debito,
      'credito', credito,
      'sucursalId', sucursal_id,
      'centroId', centro_id,
      'terceroNit', tercero_nit,
      'terceroNombre', tercero_nombre,
      'source', source
    )), '[]'::jsonb)
    from (
      select * from detalle
      union all
      select * from apertura
    ) movimientos
  );
end;
$fn$;

revoke all on function public.fn_movimientos_informe(integer, date, integer, uuid, date) from public, anon;
grant execute on function public.fn_movimientos_informe(integer, date, integer, uuid, date) to authenticated, service_role;

comment on function public.fn_movimientos_informe(integer, date, integer, uuid, date) is
  'Líneas contabilizadas hasta el corte, sin borradores ni reversiones. El día es el de la zona de la organización.';
