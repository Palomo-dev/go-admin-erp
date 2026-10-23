-- Revierte 20261023072918_terceros_selector.
-- No hubo backfill: tercero_nit y tercero_nombre no se reescribieron y se conservan.
-- Se pierden solo tercero_tipo, tercero_id y tercero_dv si se alcanzó a guardar algo ahí.
-- Para revertir en la base: una migración nueva con este SQL. No se edita el archivo ya aplicado.

drop function if exists public.pos_caja_registrar_movimiento(integer, text, numeric, text, text, text, text, uuid, timestamptz, bigint, text, uuid, text, text, text, text, text, text);

create or replace function public.pos_caja_registrar_movimiento(
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
  p_soporte_path text default null
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

  insert into public.cash_movements (
    uuid, organization_id, cash_session_id, branch_id, type, concept, concept_code,
    reference, amount, user_id, notes, created_at,
    categoria_id, cuenta_contable, centro_costo_id, tercero_nit, tercero_nombre, soporte_path
  ) values (
    coalesce(p_uuid, gen_random_uuid()), s.organization_id, s.id, s.branch_id, p_tipo, btrim(p_concepto),
    nullif(btrim(p_concept_code), ''), nullif(btrim(p_referencia), ''), round(p_monto, 2), v_uid,
    nullif(btrim(p_notas), ''),
    case when p_creado_en is not null and p_creado_en >= s.opened_at and p_creado_en <= now() + interval '5 minutes'
         then p_creado_en else now() end,
    p_categoria_id, nullif(btrim(p_cuenta_contable), ''), p_centro_costo_id,
    nullif(btrim(p_tercero_nit), ''), nullif(btrim(p_tercero_nombre), ''), nullif(btrim(p_soporte_path), '')
  )
  returning * into m;

  return to_jsonb(m) || jsonb_build_object('ya_registrado', false);
end;
$fn$;

revoke all on function public.pos_caja_registrar_movimiento(integer, text, numeric, text, text, text, text, uuid, timestamptz, bigint, text, uuid, text, text, text) from public, anon;
grant execute on function public.pos_caja_registrar_movimiento(integer, text, numeric, text, text, text, text, uuid, timestamptz, bigint, text, uuid, text, text, text) to authenticated, service_role;

comment on function public.pos_caja_registrar_movimiento(integer, text, numeric, text, text, text, text, uuid, timestamptz, bigint, text, uuid, text, text, text) is
  'Registra un ingreso o egreso en una caja abierta. Los argumentos de categoría quedan null en el POS y el asiento sigue el concepto.';

alter table public.cash_movements drop constraint if exists cash_movements_tercero_tipo_chk;
alter table public.bank_transactions drop constraint if exists bank_transactions_tercero_tipo_chk;

alter table public.cash_movements
  drop column if exists tercero_tipo,
  drop column if exists tercero_id,
  drop column if exists tercero_dv;

alter table public.bank_transactions
  drop column if exists tercero_tipo,
  drop column if exists tercero_id,
  drop column if exists tercero_dv;

drop function if exists public.fn_terceros_buscar(integer, text, integer, integer);
