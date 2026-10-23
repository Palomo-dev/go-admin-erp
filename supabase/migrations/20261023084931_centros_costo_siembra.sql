-- Centros de costo: siembra idempotente, modo sincronizado y herencia en el INSERT.
-- No reescribe centros existentes (ON CONFLICT DO NOTHING).
-- No actualiza cost_center_id de un asiento ya insertado.

-- ---------------------------------------------------------------------------
-- El modo manda. El booleano queda en true solo cuando el modo es obligatorio,
-- para que el código que todavía lee requiere_centro_costo no se desalinee.
-- Si un cliente viejo cambia solo el booleano, se traduce a modo.
-- ---------------------------------------------------------------------------

create or replace function public.fn_sync_centro_costo_modo()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_codigo text;
begin
  if tg_table_name = 'puc_plantilla' then
    v_codigo := new.codigo;
  else
    v_codigo := new.account_code;
  end if;

  if tg_op = 'UPDATE'
     and new.centro_costo_modo is distinct from old.centro_costo_modo then
    null;
  elsif tg_op = 'UPDATE'
     and new.requiere_centro_costo is distinct from old.requiere_centro_costo then
    new.centro_costo_modo := case
      when new.requiere_centro_costo then 'obligatorio'
      when old.centro_costo_modo = 'no_aplica' then 'no_aplica'
      else 'opcional'
    end;
  elsif new.centro_costo_modo is null then
    new.centro_costo_modo := case
      when coalesce(new.requiere_centro_costo, false) then 'obligatorio'
      when left(coalesce(v_codigo, ''), 1) in ('4', '5', '6', '7') then 'opcional'
      else 'no_aplica'
    end;
  end if;

  if new.centro_costo_modo not in ('obligatorio', 'opcional', 'no_aplica') then
    raise exception 'centro_costo_modo_invalido' using errcode = '22023';
  end if;
  new.requiere_centro_costo := new.centro_costo_modo = 'obligatorio';
  return new;
end;
$fn$;

drop trigger if exists trg_sync_centro_costo_modo on public.chart_of_accounts;
create trigger trg_sync_centro_costo_modo
  before insert or update on public.chart_of_accounts
  for each row execute function public.fn_sync_centro_costo_modo();

drop trigger if exists trg_sync_centro_costo_modo on public.puc_plantilla;
create trigger trg_sync_centro_costo_modo
  before insert or update on public.puc_plantilla
  for each row execute function public.fn_sync_centro_costo_modo();

-- ---------------------------------------------------------------------------
-- Resolución del centro. La cuenta en modo no_aplica nunca lo recibe.
-- ---------------------------------------------------------------------------

create or replace function public.fn_modo_centro(p_org integer, p_cuenta text)
returns text
language sql
stable
set search_path = public
as $fn$
  select coalesce(
    (select a.centro_costo_modo
       from public.chart_of_accounts a
      where a.organization_id = p_org
        and a.account_code = nullif(btrim(p_cuenta), '')),
    'no_aplica'
  );
$fn$;

create or replace function public.fn_centro_defecto(p_org integer, p_branch integer)
returns uuid
language sql
stable
set search_path = public
as $fn$
  select coalesce(
    (select b.default_cost_center_id
       from public.branches b
       join public.cost_centers c on c.id = b.default_cost_center_id
      where b.id = p_branch
        and b.organization_id = p_org
        and c.organization_id = p_org
        and c.is_active),
    (select c.id
       from public.cost_centers c
      where c.organization_id = p_org
        and c.is_default
        and c.is_active
      order by c.code
      limit 1),
    (select c.id
       from public.cost_centers c
      where c.organization_id = p_org
        and c.code = '100'
        and c.is_active
      limit 1)
  );
$fn$;

create or replace function public.fn_centro_para_cuenta(
  p_org integer,
  p_branch integer,
  p_cuenta text,
  p_centro uuid,
  p_cuenta_sin_centro text
) returns uuid
language sql
stable
set search_path = public
as $fn$
  select case
    when p_cuenta_sin_centro is not null
     and p_cuenta is not distinct from p_cuenta_sin_centro then null
    when public.fn_modo_centro(p_org, p_cuenta) = 'no_aplica' then null
    else p_centro
  end;
$fn$;

create or replace function public.fn_centro_documento(
  p_org integer,
  p_branch integer,
  p_tipo text,
  p_id uuid
) returns uuid
language sql
stable
set search_path = public
as $fn$
  select coalesce(
    case
      when p_tipo = 'compra' then (
        select ip.cost_center_id
          from public.invoice_purchase ip
         where ip.id = p_id
           and ip.organization_id = p_org
      )
    end,
    public.fn_centro_defecto(p_org, p_branch)
  );
$fn$;

create or replace function public.fn_exigencias_cuenta(
  p_organization_id integer,
  p_cuenta text,
  out requiere_tercero boolean,
  out requiere_centro_costo boolean
)
language sql
stable
set search_path = public
as $fn$
  select
    coalesce(a.requiere_tercero, false),
    coalesce(a.centro_costo_modo, 'no_aplica') = 'obligatorio'
      and exists (
        select 1
          from public.cost_centers c
         where c.organization_id = p_organization_id
           and c.is_active
      )
  from public.chart_of_accounts a
  where a.organization_id = p_organization_id
    and a.account_code = nullif(btrim(p_cuenta), '');
$fn$;

-- ---------------------------------------------------------------------------
-- Siembra. La función interna no comprueba membresía: la dispara el alta de
-- la organización, cuando el miembro todavía no existe. La RPC pública sí.
-- ---------------------------------------------------------------------------

create or replace function public.fn_centro_asegurar(
  p_org integer,
  p_code text,
  p_name text,
  p_parent uuid,
  p_branch integer,
  p_level smallint,
  p_type text,
  p_template text,
  p_es_defecto boolean,
  p_aplicar boolean,
  out o_id uuid,
  out o_accion text
)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_defecto boolean;
begin
  select c.id into o_id
    from public.cost_centers c
   where c.organization_id = p_org
     and c.code = p_code;
  if o_id is not null then
    o_accion := 'existia';
    return;
  end if;
  if not coalesce(p_aplicar, false) then
    o_accion := 'crear';
    return;
  end if;

  v_defecto := coalesce(p_es_defecto, false) and not exists (
    select 1
      from public.cost_centers c
     where c.organization_id = p_org
       and c.is_default
       and c.is_active
  );

  insert into public.cost_centers (
    organization_id, code, name, parent_id, branch_id, level, type,
    template_key, is_default, is_active
  ) values (
    p_org, p_code, p_name, p_parent, p_branch, p_level, p_type,
    p_template, v_defecto, true
  )
  on conflict (organization_id, code) do nothing
  returning id into o_id;

  if o_id is null then
    select c.id into o_id
      from public.cost_centers c
     where c.organization_id = p_org
       and c.code = p_code;
    o_accion := 'existia';
  else
    o_accion := 'creado';
  end if;
end;
$fn$;

create or replace function public.fn_sembrar_centros_costo_interno(
  p_org integer,
  p_alcance text,
  p_aplicar boolean
) returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_alcance text := coalesce(nullif(btrim(p_alcance), ''), 'completo');
  v_tipo text;
  v_plan jsonb := '[]'::jsonb;
  v_id uuid;
  v_accion text;
  v_padre_200 uuid;
  v_padre_300 uuid;
  v_code text;
  v_n integer;
  v_reservados text[] := array[]::text[];
  v_fila record;
begin
  if p_org is null then
    return jsonb_build_object('creados', 0, 'ya_existian', 0, 'previstos', 0, 'centros', '[]'::jsonb);
  end if;
  if v_alcance not in ('base', 'sector', 'sucursal', 'completo') then
    raise exception 'alcance_invalido' using errcode = '22023';
  end if;

  select ot.name into v_tipo
    from public.organizations o
    left join public.organization_types ot on ot.id = o.type_id
   where o.id = p_org;

  if v_alcance in ('base', 'sector', 'sucursal', 'completo') then
    select a.o_id, a.o_accion into v_id, v_accion
      from public.fn_centro_asegurar(
        p_org, '100'::text, 'Administración'::text, null::uuid, null::integer, 1::smallint, 'administracion'::text, 'administracion'::text, true, p_aplicar
      ) a;
    v_plan := v_plan || jsonb_build_array(jsonb_build_object('code', '100', 'name', 'Administración', 'accion', v_accion));

    select a.o_id, a.o_accion into v_id, v_accion
      from public.fn_centro_asegurar(
        p_org, '200'::text, 'Ventas/Comercial'::text, null::uuid, null::integer, 1::smallint, 'ventas'::text, 'ventas'::text, false, p_aplicar
      ) a;
    v_padre_200 := v_id;
    v_plan := v_plan || jsonb_build_array(jsonb_build_object('code', '200', 'name', 'Ventas/Comercial', 'accion', v_accion));

    select a.o_id, a.o_accion into v_id, v_accion
      from public.fn_centro_asegurar(
        p_org, '300'::text, 'Operación/Producción'::text, null::uuid, null::integer, 1::smallint, 'operacion'::text, 'operacion'::text, false, p_aplicar
      ) a;
    v_padre_300 := v_id;
    v_plan := v_plan || jsonb_build_array(jsonb_build_object('code', '300', 'name', 'Operación/Producción', 'accion', v_accion));
  end if;

  if v_alcance in ('sector', 'completo') then
    if v_tipo = 'restaurant' then
      select a.o_id, a.o_accion into v_id, v_accion
        from public.fn_centro_asegurar(p_org, '310'::text, 'Cocina'::text, v_padre_300, null::integer, 2::smallint, 'operacion'::text, 'cocina'::text, false, p_aplicar) a;
      v_plan := v_plan || jsonb_build_array(jsonb_build_object('code', '310', 'name', 'Cocina', 'accion', v_accion));
      select a.o_id, a.o_accion into v_id, v_accion
        from public.fn_centro_asegurar(p_org, '320'::text, 'Salón'::text, v_padre_300, null::integer, 2::smallint, 'operacion'::text, 'salon'::text, false, p_aplicar) a;
      v_plan := v_plan || jsonb_build_array(jsonb_build_object('code', '320', 'name', 'Salón', 'accion', v_accion));
      select a.o_id, a.o_accion into v_id, v_accion
        from public.fn_centro_asegurar(p_org, '330'::text, 'Domicilios'::text, v_padre_300, null::integer, 2::smallint, 'operacion'::text, 'domicilios'::text, false, p_aplicar) a;
      v_plan := v_plan || jsonb_build_array(jsonb_build_object('code', '330', 'name', 'Domicilios', 'accion', v_accion));
    elsif v_tipo = 'hotel' then
      select a.o_id, a.o_accion into v_id, v_accion
        from public.fn_centro_asegurar(p_org, '310'::text, 'Alojamiento'::text, v_padre_300, null::integer, 2::smallint, 'operacion'::text, 'alojamiento'::text, false, p_aplicar) a;
      v_plan := v_plan || jsonb_build_array(jsonb_build_object('code', '310', 'name', 'Alojamiento', 'accion', v_accion));
      select a.o_id, a.o_accion into v_id, v_accion
        from public.fn_centro_asegurar(p_org, '320'::text, 'Alimentos y bebidas'::text, v_padre_300, null::integer, 2::smallint, 'operacion'::text, 'alimentos'::text, false, p_aplicar) a;
      v_plan := v_plan || jsonb_build_array(jsonb_build_object('code', '320', 'name', 'Alimentos y bebidas', 'accion', v_accion));
      select a.o_id, a.o_accion into v_id, v_accion
        from public.fn_centro_asegurar(p_org, '330'::text, 'Eventos'::text, v_padre_300, null::integer, 2::smallint, 'operacion'::text, 'eventos'::text, false, p_aplicar) a;
      v_plan := v_plan || jsonb_build_array(jsonb_build_object('code', '330', 'name', 'Eventos', 'accion', v_accion));
    elsif v_tipo = 'services' then
      select a.o_id, a.o_accion into v_id, v_accion
        from public.fn_centro_asegurar(p_org, '410'::text, 'Servicios'::text, v_padre_300, null::integer, 2::smallint, 'operacion'::text, 'servicios-linea'::text, false, p_aplicar) a;
      v_plan := v_plan || jsonb_build_array(jsonb_build_object('code', '410', 'name', 'Servicios', 'accion', v_accion));
    end if;
  end if;

  if v_alcance in ('sucursal', 'completo') then
    for v_fila in
      select b.id, b.name
        from public.branches b
       where b.organization_id = p_org
       order by b.id
    loop
      -- SELECT INTO no borra la variable si no hay fila: sin esto, la
      -- sucursal heredaba el id del centro anterior y no se creaba la suya.
      v_id := null;
      select c.id into v_id
        from public.cost_centers c
       where c.organization_id = p_org
         and c.branch_id = v_fila.id
         and c.template_key = 'ventas-sucursal'
       limit 1;

      if v_id is not null then
        v_accion := 'existia';
        select c.code into v_code from public.cost_centers c where c.id = v_id;
      else
        v_n := 210;
        loop
          exit when v_n > 990;
          exit when not exists (
            select 1 from public.cost_centers c
             where c.organization_id = p_org and c.code = v_n::text
          ) and not coalesce(v_n::text = any(v_reservados), false);
          v_n := v_n + 10;
        end loop;
        if v_n > 990 then
          v_code := '2B' || v_fila.id::text;
        else
          v_code := v_n::text;
        end if;
        v_reservados := v_reservados || v_code;
        select a.o_id, a.o_accion into v_id, v_accion
          from public.fn_centro_asegurar(
            p_org,
            v_code,
            left('Ventas ' || coalesce(v_fila.name, v_fila.id::text), 120),
            v_padre_200,
            v_fila.id,
            2::smallint,
            'ventas'::text,
            'ventas-sucursal'::text,
            false,
            p_aplicar
          ) a;
      end if;

      if coalesce(p_aplicar, false) and v_id is not null then
        update public.branches b
           set default_cost_center_id = v_id
         where b.id = v_fila.id
           and b.organization_id = p_org
           and b.default_cost_center_id is null;
      end if;

      v_plan := v_plan || jsonb_build_array(jsonb_build_object(
        'code', v_code,
        'name', left('Ventas ' || coalesce(v_fila.name, v_fila.id::text), 120),
        'accion', v_accion,
        'branch_id', v_fila.id
      ));
    end loop;
  end if;

  return jsonb_build_object(
    'creados', (select count(*) from jsonb_array_elements(v_plan) e where e->>'accion' = 'creado'),
    'ya_existian', (select count(*) from jsonb_array_elements(v_plan) e where e->>'accion' = 'existia'),
    'previstos', (select count(*) from jsonb_array_elements(v_plan) e where e->>'accion' = 'crear'),
    'centros', v_plan
  );
end;
$fn$;
