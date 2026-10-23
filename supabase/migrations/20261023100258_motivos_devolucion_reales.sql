-- Motivos de devolución que el formulario ya mostraba, ahora en return_reasons.
-- procesar_devolucion solo acepta un motivo activo (por id o por código).
-- El criterio de inventario y de foto sigue al catálogo anterior de ocho códigos:
--   DEFECTUOSO, como DEFECT: no repone inventario y pide foto.
--   INCORRECTO, como WRONG: repone inventario y no pide foto.
--   DANADO, como DAMAGED: no repone inventario y pide foto.
--   NO_CONFORME, como QUALITY: repone inventario y no pide foto.
--   GARANTIA, reclamación: no repone inventario y pide foto.
--   OTRO, como OTHER: repone inventario y no pide foto.
-- ON CONFLICT no pisa un código que la organización ya tenga.
--
-- El sembrador es security definer: return_reasons tiene RLS y, al crear la
-- organización, el usuario todavía no es miembro. No se concede a anon ni a
-- authenticated: recibe el id y, con elevación, escribiría en otra organización.
-- Lo llama el disparador (solo NEW.id) y esta migración. El disparador sí se
-- concede a authenticated porque el alta de organización corre como el usuario.

create or replace function public.fn_create_default_return_reasons(p_org_id integer)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if p_org_id is null then
    raise exception 'fn_create_default_return_reasons: falta la organización'
      using errcode = '22023';
  end if;

  insert into public.return_reasons (
    organization_id, code, name, description,
    requires_photo, affects_inventory, is_active, display_order
  )
  values
    (p_org_id, 'DEFECTUOSO', 'Producto defectuoso', 'El producto presenta fallas', true, false, true, 1::smallint),
    (p_org_id, 'INCORRECTO', 'Producto incorrecto', 'Llegó un producto distinto al pedido', false, true, true, 2::smallint),
    (p_org_id, 'DANADO', 'Producto dañado', 'El producto llegó dañado', true, false, true, 3::smallint),
    (p_org_id, 'NO_CONFORME', 'No conforme', 'No cumple lo esperado', false, true, true, 4::smallint),
    (p_org_id, 'GARANTIA', 'Garantía', 'Reclamo de garantía', true, false, true, 5::smallint),
    (p_org_id, 'OTRO', 'Otro motivo', 'Motivo no listado', false, true, true, 6::smallint)
  on conflict (organization_id, code) do nothing;
end;
$fn$;

comment on function public.fn_create_default_return_reasons(integer) is
  'Siembra los seis motivos de devolución del formulario. No pisa códigos ya existentes.';

revoke all on function public.fn_create_default_return_reasons(integer) from public, anon, authenticated;
grant execute on function public.fn_create_default_return_reasons(integer) to service_role;

create or replace function public.trg_fn_sembrar_motivos_devolucion()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
begin
  if tg_op is distinct from 'INSERT' then
    return null;
  end if;
  perform public.fn_create_default_return_reasons(new.id);
  return new;
end;
$fn$;

comment on function public.trg_fn_sembrar_motivos_devolucion() is
  'Al crear una organización, siembra sus seis motivos de devolución.';

revoke all on function public.trg_fn_sembrar_motivos_devolucion() from public, anon;
grant execute on function public.trg_fn_sembrar_motivos_devolucion() to authenticated, service_role;

drop trigger if exists tr_zzz_motivos_devolucion on public.organizations;
create trigger tr_zzz_motivos_devolucion
  after insert on public.organizations
  for each row execute function public.trg_fn_sembrar_motivos_devolucion();

create temporary table _motivos_previos on commit drop as
select organization_id, code, name
from public.return_reasons;

do $sembrar$
declare
  v_org integer;
begin
  for v_org in select id from public.organizations order by id loop
    perform public.fn_create_default_return_reasons(v_org);
  end loop;
  -- Segunda pasada: el conflicto no duplica ni modifica.
  for v_org in select id from public.organizations order by id loop
    perform public.fn_create_default_return_reasons(v_org);
  end loop;
end;
$sembrar$;

do $verificar$
declare
  v_definer boolean;
  v_anon_sembrador boolean;
  v_auth_sembrador boolean;
  v_public_execute boolean;
begin
  if exists (
    select 1
    from _motivos_previos p
    where not exists (
      select 1
      from public.return_reasons rr
      where rr.organization_id = p.organization_id
        and rr.code = p.code
        and rr.name = p.name
    )
  ) then
    raise exception 'se_modificaron_motivos_previos';
  end if;

  if exists (select 1 from public.organizations where id = 140)
     and not exists (
       select 1 from public.return_reasons
       where organization_id = 140 and code = 'PRUEBA-DEV' and name = 'PRUEBA dev motivo'
     ) then
    raise exception 'org_140_sin_prueba_dev';
  end if;

  if exists (
    select 1
    from public.organizations o
    cross join (
      values
        ('DEFECTUOSO'::text, true, false),
        ('INCORRECTO'::text, false, true),
        ('DANADO'::text, true, false),
        ('NO_CONFORME'::text, false, true),
        ('GARANTIA'::text, true, false),
        ('OTRO'::text, false, true)
    ) as esperado(code, foto, inventario)
    where not exists (
      select 1
      from public.return_reasons rr
      where rr.organization_id = o.id
        and rr.is_active
        and rr.code = esperado.code
        and rr.requires_photo = esperado.foto
        and rr.affects_inventory = esperado.inventario
        and upper(rr.code) = upper(btrim(esperado.code))
    )
  ) then
    raise exception 'faltan_motivos_activos';
  end if;

  if exists (
    select 1
    from public.return_reasons
    where code in ('DEFECTUOSO', 'INCORRECTO', 'DANADO', 'NO_CONFORME', 'GARANTIA', 'OTRO')
    group by organization_id, code
    having count(*) > 1
  ) then
    raise exception 'motivos_duplicados';
  end if;

  select exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'fn_create_default_return_reasons'
      and p.prosecdef
  ) into v_definer;
  if not v_definer then
    raise exception 'sembrador_sin_security_definer';
  end if;

  v_anon_sembrador := has_function_privilege('anon', 'public.fn_create_default_return_reasons(integer)', 'execute');
  v_auth_sembrador := has_function_privilege('authenticated', 'public.fn_create_default_return_reasons(integer)', 'execute');
  if v_anon_sembrador or v_auth_sembrador then
    raise exception 'el_sembrador_queda_ejecutable_por_el_cliente';
  end if;

  if not has_function_privilege('authenticated', 'public.trg_fn_sembrar_motivos_devolucion()', 'execute') then
    raise exception 'authenticated_no_puede_disparar_el_sembrado';
  end if;
  if has_function_privilege('anon', 'public.trg_fn_sembrar_motivos_devolucion()', 'execute') then
    raise exception 'anon_puede_disparar_el_sembrado';
  end if;

  select exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where n.nspname = 'public'
      and p.proname in ('fn_create_default_return_reasons', 'trg_fn_sembrar_motivos_devolucion')
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ) into v_public_execute;
  if v_public_execute then
    raise exception 'public_conserva_execute';
  end if;

  if not exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'organizations'
      and t.tgname = 'tr_zzz_motivos_devolucion'
      and not t.tgisinternal
  ) then
    raise exception 'falta_el_disparador';
  end if;
end;
$verificar$;
