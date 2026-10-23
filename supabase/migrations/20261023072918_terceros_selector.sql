-- Tercero elegido en tesorería y búsqueda única de clientes, proveedores y empleados.
-- No reescribe tercero_nit ni tercero_nombre ya guardados. Las columnas nuevas quedan null.

alter table public.cash_movements
  add column if not exists tercero_tipo text,
  add column if not exists tercero_id text,
  add column if not exists tercero_dv text;

alter table public.bank_transactions
  add column if not exists tercero_tipo text,
  add column if not exists tercero_id text,
  add column if not exists tercero_dv text;

alter table public.cash_movements drop constraint if exists cash_movements_tercero_tipo_chk;
alter table public.cash_movements
  add constraint cash_movements_tercero_tipo_chk
  check (tercero_tipo is null or tercero_tipo in ('cliente', 'proveedor', 'empleado', 'nit'));

alter table public.bank_transactions drop constraint if exists bank_transactions_tercero_tipo_chk;
alter table public.bank_transactions
  add constraint bank_transactions_tercero_tipo_chk
  check (tercero_tipo is null or tercero_tipo in ('cliente', 'proveedor', 'empleado', 'nit'));

comment on column public.cash_movements.tercero_tipo is
  'Origen del tercero elegido: cliente, proveedor, empleado o nit. Null en filas anteriores.';
comment on column public.cash_movements.tercero_id is
  'Id del tercero elegido (uuid de cliente o de usuario, o id de proveedor en texto). Null si solo se confirmó un NIT.';
comment on column public.cash_movements.tercero_dv is
  'Dígito de verificación DIAN, aparte del número. Null si el documento no lo trae o la fila es anterior.';
comment on column public.bank_transactions.tercero_tipo is
  'Origen del tercero elegido: cliente, proveedor, empleado o nit. Null en filas anteriores.';
comment on column public.bank_transactions.tercero_id is
  'Id del tercero elegido (uuid de cliente o de usuario, o id de proveedor en texto). Null si solo se confirmó un NIT.';
comment on column public.bank_transactions.tercero_dv is
  'Dígito de verificación DIAN, aparte del número. Null si el documento no lo trae o la fila es anterior.';

create or replace function public.fn_terceros_buscar(
  p_organization_id integer,
  p_q text,
  p_limite integer default 20,
  p_desde integer default 0
) returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_q text := btrim(coalesce(p_q, ''));
  v_digitos text := regexp_replace(btrim(coalesce(p_q, '')), '[^0-9]', '', 'g');
  v_like text;
  v_limite integer := least(greatest(coalesce(p_limite, 20), 1), 50);
  v_desde integer := greatest(coalesce(p_desde, 0), 0);
  v_total integer := 0;
  v_filas jsonb := '[]'::jsonb;
begin
  perform public.fn_assert_acceso_org(p_organization_id);
  v_like := '%' || replace(replace(replace(v_q, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';

  with coincidencias as (
    select
      'cliente'::text as tipo,
      c.id::text as id,
      coalesce(
        nullif(btrim(c.full_name), ''),
        nullif(btrim(c.company_name), ''),
        nullif(btrim(concat_ws(' ', c.first_name, c.last_name)), ''),
        'Sin nombre'
      ) as nombre,
      nullif(btrim(c.identification_number), '') as documento,
      case when c.dv is null then null else c.dv::text end as dv,
      nullif(btrim(c.email), '') as email,
      nullif(btrim(c.identification_type), '') as tipo_doc
    from public.customers c
    where c.organization_id = p_organization_id
      and coalesce(c.status, 'active') not in ('inactive', 'archived', 'deleted')
      and (
        v_q = ''
        or c.full_name ilike v_like escape E'\\'
        or c.company_name ilike v_like escape E'\\'
        or c.email ilike v_like escape E'\\'
        or (
          v_digitos <> ''
          and regexp_replace(coalesce(c.identification_number, ''), '[^0-9]', '', 'g') like '%' || v_digitos || '%'
        )
      )
    union all
    select
      'proveedor',
      s.id::text,
      s.name,
      nullif(btrim(s.nit), ''),
      nullif(btrim(s.dv::text), ''),
      nullif(btrim(s.email), ''),
      coalesce(nullif(btrim(s.doc_type), ''), case when nullif(btrim(s.nit), '') is not null then 'nit' else null end)
    from public.suppliers s
    where s.organization_id = p_organization_id
      and s.is_active is not false
      and (
        v_q = ''
        or s.name ilike v_like escape E'\\'
        or s.email ilike v_like escape E'\\'
        or (
          v_digitos <> ''
          and regexp_replace(coalesce(s.nit, ''), '[^0-9]', '', 'g') like '%' || v_digitos || '%'
        )
      )
    union all
    select
      'empleado',
      m.user_id::text,
      coalesce(nullif(btrim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email::text),
      null::text,
      null::text,
      nullif(btrim(p.email::text), ''),
      null::text
    from public.organization_members m
    join public.profiles p on p.id = m.user_id
    where m.organization_id = p_organization_id
      and m.is_active is not false
      and (
        v_q = ''
        or concat_ws(' ', p.first_name, p.last_name) ilike v_like escape E'\\'
        or p.email::text ilike v_like escape E'\\'
      )
  ),
  contada as (
    select coincidencias.*, count(*) over () as total_coincidencias
    from coincidencias
  )
  select
    coalesce(max(total_coincidencias), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'tipo', tipo,
      'id', id,
      'nombre', nombre,
      'documento', documento,
      'dv', dv,
      'email', email,
      'tipo_doc', tipo_doc
    ) order by nombre, tipo, id), '[]'::jsonb)
  into v_total, v_filas
  from (
    select * from contada
    order by nombre, tipo, id
    offset v_desde
    limit v_limite
  ) pagina;

  return jsonb_build_object('total', v_total, 'filas', v_filas);
end;
$fn$;

comment on function public.fn_terceros_buscar(integer, text, integer, integer) is
  'Busca clientes, proveedores y empleados de la organización por nombre, documento o correo. Incluye filas sin documento. El texto es un argumento, no un filtro armado.';

revoke all on function public.fn_terceros_buscar(integer, text, integer, integer) from public, anon;
grant execute on function public.fn_terceros_buscar(integer, text, integer, integer) to authenticated, service_role;

drop function if exists public.pos_caja_registrar_movimiento(integer, text, numeric, text, text, text, text, uuid, timestamptz, bigint, text, uuid, text, text, text);
drop function if exists public.pos_caja_registrar_movimiento(integer, text, numeric, text, text, text, text, uuid, timestamptz, bigint, text, uuid, text, text, text, text, text, text);

create function public.pos_caja_registrar_movimiento(
  p_session_id integer,
  p_tipo text,
  p_monto numeric,
  p_concepto text,
  p_concept_code text default null,
  p_referencia text default null,
  p_notas text default null,
  p_uuid uuid default null,
  p_creado_en timestamptz default null,
  p_categoria_id bigint default null,
  p_cuenta_contable text default null,
  p_centro_costo_id uuid default null,
  p_tercero_nit text default null,
  p_tercero_nombre text default null,
  p_soporte_path text default null,
  p_tercero_tipo text default null,
  p_tercero_id text default null,
  p_tercero_dv text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_uid uuid := auth.uid();
  s record;
  m public.cash_movements;
begin
  if v_uid is null then
    raise exception 'no_autenticado' using errcode = '42501';
  end if;

  select id, organization_id, branch_id, status, opened_at
    into s
    from public.cash_sessions
   where id = p_session_id
   for share;
  if not found then
    raise exception 'caja_no_encontrada' using errcode = 'P0002';
  end if;

  perform public.fn_assert_acceso_org(s.organization_id);
  if s.branch_id is not null and not public.app_branch_access(s.branch_id) then
    raise exception 'sin_acceso_sucursal' using errcode = '42501';
  end if;

  if p_uuid is not null then
    select * into m from public.cash_movements where organization_id = s.organization_id and uuid = p_uuid;
    if found then
      return to_jsonb(m) || jsonb_build_object('ya_registrado', true);
    end if;
  end if;

  if s.status <> 'open' then
    raise exception 'caja_cerrada' using errcode = '55000';
  end if;
  if p_tipo is null or p_tipo not in ('in', 'out') then
    raise exception 'tipo_invalido' using errcode = '22023';
  end if;
  if p_monto is null or p_monto <= 0 or p_monto > 1e12 then
    raise exception 'monto_invalido' using errcode = '22023';
  end if;
  if coalesce(btrim(p_concepto), '') = '' then
    raise exception 'concepto_requerido' using errcode = '22023';
  end if;
  if p_tercero_tipo is not null and p_tercero_tipo not in ('cliente', 'proveedor', 'empleado', 'nit') then
    raise exception 'tercero_tipo_invalido' using errcode = '22023';
  end if;

  insert into public.cash_movements (
    uuid, organization_id, cash_session_id, branch_id, type, concept, concept_code,
    reference, amount, user_id, notes, created_at,
    categoria_id, cuenta_contable, centro_costo_id, tercero_nit, tercero_nombre, soporte_path,
    tercero_tipo, tercero_id, tercero_dv
  ) values (
    coalesce(p_uuid, gen_random_uuid()), s.organization_id, s.id, s.branch_id, p_tipo, btrim(p_concepto),
    nullif(btrim(p_concept_code), ''), nullif(btrim(p_referencia), ''), round(p_monto, 2), v_uid,
    nullif(btrim(p_notas), ''),
    case when p_creado_en is not null and p_creado_en >= s.opened_at and p_creado_en <= now() + interval '5 minutes'
         then p_creado_en else now() end,
    p_categoria_id, nullif(btrim(p_cuenta_contable), ''), p_centro_costo_id,
    nullif(btrim(p_tercero_nit), ''), nullif(btrim(p_tercero_nombre), ''), nullif(btrim(p_soporte_path), ''),
    nullif(btrim(p_tercero_tipo), ''), nullif(btrim(p_tercero_id), ''), nullif(btrim(p_tercero_dv), '')
  )
  returning * into m;

  return to_jsonb(m) || jsonb_build_object('ya_registrado', false);
end;
$fn$;

revoke all on function public.pos_caja_registrar_movimiento(integer, text, numeric, text, text, text, text, uuid, timestamptz, bigint, text, uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.pos_caja_registrar_movimiento(integer, text, numeric, text, text, text, text, uuid, timestamptz, bigint, text, uuid, text, text, text, text, text, text) to authenticated, service_role;

comment on function public.pos_caja_registrar_movimiento(integer, text, numeric, text, text, text, text, uuid, timestamptz, bigint, text, uuid, text, text, text, text, text, text) is
  'Registra un ingreso o egreso en una caja abierta. Los tres argumentos finales guardan el tercero elegido; sin ellos el movimiento queda como antes.';
