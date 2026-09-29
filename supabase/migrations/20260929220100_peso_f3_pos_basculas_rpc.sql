-- Fase 3 de productos por peso: RPC de las básculas del POS
-- (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.8, §2.11, §3 M4 y M6).
--
-- Todas SECURITY DEFINER con fn_assert_acceso_org y revoke de anon/public:
--   pos_basculas_listar(org, sucursal?)            Configuración › POS › Básculas. Devuelve si la
--                                                 persona puede configurar; sin el permiso, la lista va vacía.
--   pos_basculas_guardar(org, payload)             crear o editar (permiso pos.basculas.configurar).
--   pos_basculas_archivar(org, id, archivar)       archivar o reactivar (mismo permiso).
--   pos_basculas_registrar_prueba(org, id, ok)     resultado de «Probar lectura» (mismo permiso).
--   pos_basculas_para_pos(org, sucursal, caja?, equipo?)
--                                                 lectura del POS: básculas activas de la sucursal
--                                                 con la prioridad para este equipo. Solo pertenencia.
-- El permiso se resuelve en el servidor (check_user_permission o dueño de la
-- organización), nunca por el nombre del rol (CLAUDE.md, regla 6).

-- ── Permiso ────────────────────────────────────────────────────────────────
create or replace function public.fn_pos_basculas_puede_configurar(p_org integer, p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_uid is not null and (
    exists (select 1 from public.organizations o where o.id = p_org and o.owner_user_id = p_uid)
    or coalesce(public.check_user_permission(p_uid, p_org, 'pos.basculas.configurar'), false));
$$;

comment on function public.fn_pos_basculas_puede_configurar(integer, uuid) is
  'true si la persona es dueña de la organización o tiene pos.basculas.configurar. Uso interno de las RPC pos_basculas_*.';

revoke all on function public.fn_pos_basculas_puede_configurar(integer, uuid) from public, anon, authenticated;
grant execute on function public.fn_pos_basculas_puede_configurar(integer, uuid) to service_role;

create or replace function public.fn_pos_basculas_exigir_permiso(p_org integer)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
begin
  perform public.fn_assert_acceso_org(p_org);
  if v_uid is null then
    return;  -- service role (fn_assert_acceso_org ya rechazó anon/authenticated sin sesión)
  end if;
  if not public.fn_pos_basculas_puede_configurar(p_org, v_uid) then
    raise exception 'sin_permiso' using errcode = '42501',
      detail = 'Configurar básculas necesita el permiso «Configurar básculas y etiquetas de peso».';
  end if;
end;
$$;

revoke all on function public.fn_pos_basculas_exigir_permiso(integer) from public, anon, authenticated;
grant execute on function public.fn_pos_basculas_exigir_permiso(integer) to service_role;

-- ── Forma de salida ────────────────────────────────────────────────────────
create or replace function public.fn_pos_bascula_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (to_jsonb(s) - 'created_by' - 'unit_code')
         || jsonb_build_object(
              'unit_code', btrim(s.unit_code),
              'branch_name', b.name,
              'print_agent_name', pa.agent_name,
              'pos_terminal_name', pt.name)
    from public.pos_scales s
    join public.branches b on b.id = s.branch_id
    left join public.print_agents pa on pa.id = s.print_agent_id
    left join public.pos_terminals pt on pt.id = s.pos_terminal_id
   where s.id = p_id;
$$;

revoke all on function public.fn_pos_bascula_json(uuid) from public, anon, authenticated;
grant execute on function public.fn_pos_bascula_json(uuid) to service_role;

-- ── Listar (Configuración) ─────────────────────────────────────────────────
create or replace function public.pos_basculas_listar(p_org integer, p_branch integer default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid   uuid := auth.uid();
  v_puede boolean;
begin
  perform public.fn_assert_acceso_org(p_org);
  v_puede := v_uid is null or public.fn_pos_basculas_puede_configurar(p_org, v_uid);
  if not v_puede then
    return jsonb_build_object('puede_configurar', false, 'basculas', '[]'::jsonb);
  end if;
  return jsonb_build_object(
    'puede_configurar', true,
    'basculas', coalesce((
      select jsonb_agg(public.fn_pos_bascula_json(s.id) order by s.is_active desc, b.name, s.name)
        from public.pos_scales s
        join public.branches b on b.id = s.branch_id
       where s.organization_id = p_org
         and (p_branch is null or s.branch_id = p_branch)), '[]'::jsonb));
end;
$$;

comment on function public.pos_basculas_listar(integer, integer) is
  'Configuración › POS › Básculas: básculas de la organización (o de una sucursal) y si la persona puede configurarlas (pos.basculas.configurar, resuelto en el servidor).';

revoke all on function public.pos_basculas_listar(integer, integer) from public, anon;
grant execute on function public.pos_basculas_listar(integer, integer) to authenticated, service_role;

-- ── Guardar (crear o editar) ───────────────────────────────────────────────
create or replace function public.pos_basculas_guardar(p_org integer, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_id        uuid;
  v           jsonb;
  v_branch    integer;
  v_name      text;
  v_transport text;
  v_protocol  text;
  v_pattern   text;
  v_hint      text;
  v_agent     uuid;
  v_terminal  uuid;
  v_unit      text;
begin
  perform public.fn_pos_basculas_exigir_permiso(p_org);
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'datos_invalidos' using errcode = '22023', detail = 'Se esperaba un objeto con la báscula.';
  end if;

  begin
    v_id := nullif(p_payload->>'id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'bascula_no_encontrada' using errcode = '22023';
  end;

  if v_id is null then
    v := jsonb_build_object('transport', 'web_serial', 'protocol', 'continuous_st_gs', 'baud_rate', 9600,
                            'data_bits', 8, 'parity', 'none', 'stop_bits', 1, 'unit_code', 'KG',
                            'decimals', 3, 'stable_ms', 500);
  else
    select to_jsonb(s) into v from public.pos_scales s
     where s.id = v_id and s.organization_id = p_org
       for update;
    if not found then
      raise exception 'bascula_no_encontrada' using errcode = '22023',
        detail = format('La báscula %s no es de la organización.', v_id);
    end if;
  end if;
  -- Lo que no viene en el payload se conserva; lo que no es editable se ignora.
  v := v || (p_payload - 'id' - 'organization_id' - 'is_active' - 'created_by' - 'created_at'
                       - 'updated_at' - 'last_test_at' - 'last_test_ok');

  begin
    v_branch    := (v->>'branch_id')::integer;
    v_name      := btrim(coalesce(v->>'name', ''));
    v_transport := v->>'transport';
    v_protocol  := v->>'protocol';
    v_pattern   := nullif(btrim(coalesce(v->>'custom_pattern', '')), '');
    v_hint      := nullif(btrim(coalesce(v->>'device_hint', '')), '');
    v_agent     := nullif(v->>'print_agent_id', '')::uuid;
    v_terminal  := nullif(v->>'pos_terminal_id', '')::uuid;
    v_unit      := upper(btrim(coalesce(v->>'unit_code', 'KG')));
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'datos_invalidos' using errcode = '22023', detail = SQLERRM;
  end;

  if v_branch is null or not exists (select 1 from public.branches b where b.id = v_branch and b.organization_id = p_org) then
    raise exception 'sucursal_invalida' using errcode = '22023',
      detail = format('La sucursal %s no es de la organización.', v_branch);
  end if;
  if v_transport not in ('desktop_serial', 'web_serial') then
    raise exception 'transporte_no_disponible' using errcode = '22023',
      detail = format('El transporte %s todavía no está disponible.', coalesce(v_transport, '—'));
  end if;
  if v_agent is not null and not exists (select 1 from public.print_agents pa where pa.id = v_agent and pa.organization_id = p_org) then
    raise exception 'equipo_invalido' using errcode = '22023',
      detail = format('El equipo %s no es de la organización.', v_agent);
  end if;
  if v_terminal is not null and not exists (select 1 from public.pos_terminals pt
                                             where pt.id = v_terminal and pt.organization_id = p_org and pt.branch_id = v_branch) then
    raise exception 'caja_invalida' using errcode = '22023',
      detail = format('La caja %s no es de la sucursal %s.', v_terminal, v_branch);
  end if;
  if not exists (select 1 from public.units u
                  where btrim(u.code) = v_unit and u.unit_type = 'weight'
                    and (u.organization_id is null or u.organization_id = p_org)) then
    raise exception 'unidad_invalida' using errcode = '22023',
      detail = format('La unidad %s no es de peso.', v_unit);
  end if;
  if v_protocol <> 'custom_regex' then
    v_pattern := null;
  end if;

  begin
    if v_id is null then
      insert into public.pos_scales (
        organization_id, branch_id, name, transport, protocol, custom_pattern, device_hint,
        print_agent_id, pos_terminal_id, baud_rate, data_bits, parity, stop_bits, unit_code,
        decimals, capacity_max, min_division, stable_ms, created_by)
      values (
        p_org, v_branch, v_name, v_transport, v_protocol, v_pattern, v_hint,
        v_agent, v_terminal, (v->>'baud_rate')::integer, (v->>'data_bits')::smallint, v->>'parity',
        (v->>'stop_bits')::smallint, v_unit, (v->>'decimals')::smallint,
        nullif(v->>'capacity_max', '')::numeric, nullif(v->>'min_division', '')::numeric,
        (v->>'stable_ms')::integer, auth.uid())
      returning id into v_id;
    else
      update public.pos_scales s set
        branch_id       = v_branch,
        name            = v_name,
        transport       = v_transport,
        protocol        = v_protocol,
        custom_pattern  = v_pattern,
        device_hint     = v_hint,
        print_agent_id  = v_agent,
        pos_terminal_id = v_terminal,
        baud_rate       = (v->>'baud_rate')::integer,
        data_bits       = (v->>'data_bits')::smallint,
        parity          = v->>'parity',
        stop_bits       = (v->>'stop_bits')::smallint,
        unit_code       = v_unit,
        decimals        = (v->>'decimals')::smallint,
        capacity_max    = nullif(v->>'capacity_max', '')::numeric,
        min_division    = nullif(v->>'min_division', '')::numeric,
        stable_ms       = (v->>'stable_ms')::integer,
        updated_at      = now()
      where s.id = v_id and s.organization_id = p_org;
    end if;
  exception
    when unique_violation then
      raise exception 'nombre_duplicado' using errcode = '23505',
        detail = format('Ya hay una báscula activa llamada «%s» en esa sucursal.', v_name);
    when check_violation or not_null_violation then
      raise exception 'datos_invalidos' using errcode = '22023', detail = SQLERRM;
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'datos_invalidos' using errcode = '22023', detail = SQLERRM;
  end;

  return public.fn_pos_bascula_json(v_id);
end;
$$;

comment on function public.pos_basculas_guardar(integer, jsonb) is
  'Crea (sin id) o edita (con id) una báscula del POS. Permiso pos.basculas.configurar. Errores: sin_permiso, bascula_no_encontrada, sucursal_invalida, transporte_no_disponible, equipo_invalido, caja_invalida, unidad_invalida, nombre_duplicado, datos_invalidos.';

revoke all on function public.pos_basculas_guardar(integer, jsonb) from public, anon;
grant execute on function public.pos_basculas_guardar(integer, jsonb) to authenticated, service_role;

-- ── Archivar / reactivar ───────────────────────────────────────────────────
create or replace function public.pos_basculas_archivar(p_org integer, p_id uuid, p_archivar boolean default true)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text;
begin
  perform public.fn_pos_basculas_exigir_permiso(p_org);
  begin
    update public.pos_scales s
       set is_active = not coalesce(p_archivar, true), updated_at = now()
     where s.id = p_id and s.organization_id = p_org
    returning s.name into v_name;
  exception when unique_violation then
    raise exception 'nombre_duplicado' using errcode = '23505',
      detail = 'Ya hay una báscula activa con ese nombre en la sucursal: renómbrala antes de reactivar.';
  end;
  if v_name is null then
    raise exception 'bascula_no_encontrada' using errcode = '22023',
      detail = format('La báscula %s no es de la organización.', p_id);
  end if;
  return public.fn_pos_bascula_json(p_id);
end;
$$;

comment on function public.pos_basculas_archivar(integer, uuid, boolean) is
  'Archiva (p_archivar = true) o reactiva una báscula del POS. Nunca borra: las ventas guardan su id en notes.pesaje. Permiso pos.basculas.configurar.';

revoke all on function public.pos_basculas_archivar(integer, uuid, boolean) from public, anon;
grant execute on function public.pos_basculas_archivar(integer, uuid, boolean) to authenticated, service_role;

-- ── Registrar la prueba de lectura ─────────────────────────────────────────
create or replace function public.pos_basculas_registrar_prueba(p_org integer, p_id uuid, p_ok boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_pos_basculas_exigir_permiso(p_org);
  if p_ok is null then
    raise exception 'datos_invalidos' using errcode = '22023', detail = 'Falta el resultado de la prueba.';
  end if;
  update public.pos_scales s
     set last_test_at = now(), last_test_ok = p_ok, updated_at = now()
   where s.id = p_id and s.organization_id = p_org;
  if not found then
    raise exception 'bascula_no_encontrada' using errcode = '22023',
      detail = format('La báscula %s no es de la organización.', p_id);
  end if;
  return public.fn_pos_bascula_json(p_id);
end;
$$;

comment on function public.pos_basculas_registrar_prueba(integer, uuid, boolean) is
  'Guarda el resultado de «Probar lectura» (last_test_at, last_test_ok). Permiso pos.basculas.configurar.';

revoke all on function public.pos_basculas_registrar_prueba(integer, uuid, boolean) from public, anon;
grant execute on function public.pos_basculas_registrar_prueba(integer, uuid, boolean) to authenticated, service_role;

-- ── Lectura del POS ────────────────────────────────────────────────────────
create or replace function public.pos_basculas_para_pos(
  p_org integer,
  p_branch integer,
  p_pos_terminal uuid default null,
  p_print_agent uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_assert_acceso_org(p_org);
  if p_branch is null or not exists (select 1 from public.branches b where b.id = p_branch and b.organization_id = p_org) then
    raise exception 'sucursal_invalida' using errcode = '22023',
      detail = format('La sucursal %s no es de la organización.', p_branch);
  end if;
  return coalesce((
    select jsonb_agg(x.fila order by x.prioridad desc, x.nombre)
      from (
        select jsonb_build_object(
                 'id', s.id,
                 'name', s.name,
                 'transport', s.transport,
                 'protocol', s.protocol,
                 'custom_pattern', s.custom_pattern,
                 'device_hint', s.device_hint,
                 'baud_rate', s.baud_rate,
                 'data_bits', s.data_bits,
                 'parity', s.parity,
                 'stop_bits', s.stop_bits,
                 'unit_code', btrim(s.unit_code),
                 'decimals', s.decimals,
                 'capacity_max', s.capacity_max,
                 'min_division', s.min_division,
                 'stable_ms', s.stable_ms,
                 'pos_terminal_id', s.pos_terminal_id,
                 'print_agent_id', s.print_agent_id,
                 'asignada_a_este_equipo',
                   (p_pos_terminal is not null and s.pos_terminal_id = p_pos_terminal)
                   or (p_print_agent is not null and s.print_agent_id = p_print_agent),
                 'asignada_a_otro_equipo',
                   (s.pos_terminal_id is not null and s.pos_terminal_id is distinct from p_pos_terminal)
                   or (s.print_agent_id is not null and s.print_agent_id is distinct from p_print_agent
                       and not (p_pos_terminal is not null and s.pos_terminal_id = p_pos_terminal))) as fila,
               case
                 when p_pos_terminal is not null and s.pos_terminal_id = p_pos_terminal then 3
                 when p_print_agent is not null and s.print_agent_id = p_print_agent then 2
                 when s.pos_terminal_id is null and s.print_agent_id is null then 1
                 else 0
               end as prioridad,
               s.name as nombre
          from public.pos_scales s
         where s.organization_id = p_org
           and s.branch_id = p_branch
           and s.is_active) x), '[]'::jsonb);
end;
$$;

comment on function public.pos_basculas_para_pos(integer, integer, uuid, uuid) is
  'POS: básculas activas de la sucursal para conectarse, primero las de esta caja (pos_terminal_id) o este equipo (print_agent_id), luego las sin asignar. Solo pertenencia a la organización.';

revoke all on function public.pos_basculas_para_pos(integer, integer, uuid, uuid) from public, anon;
grant execute on function public.pos_basculas_para_pos(integer, integer, uuid, uuid) to authenticated, service_role;
