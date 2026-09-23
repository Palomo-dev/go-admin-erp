-- «Seleccionar los N» del listado de clientes: los ids de TODO el filtro, no
-- solo de la página. Reutiliza fn_clientes_listado página a página (mismos
-- filtros, misma búsqueda, mismo estado): una sola definición del criterio.
-- Tope de 20.000 ids por llamada (la organización más grande tiene ~18.000).

create or replace function public.fn_clientes_ids(
  p_org integer,
  p_branch integer default null,
  p_busqueda text default null,
  p_tipo text default null,
  p_rol text default null,
  p_etiqueta text default null,
  p_municipio uuid default null,
  p_saldo text default null,
  p_estado text default 'active'
)
returns uuid[]
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[] := array[]::uuid[];
  v_lote uuid[];
  v_desde integer := 0;
begin
  perform public.fn_assert_acceso_org(p_org);
  loop
    select coalesce(array_agg(l.id), array[]::uuid[]) into v_lote
    from public.fn_clientes_listado(
      p_org, p_branch, p_busqueda, p_tipo, p_rol, p_etiqueta, p_municipio, p_saldo, p_estado,
      'creado', 'asc', 1000, v_desde, null
    ) l;
    v_ids := v_ids || v_lote;
    exit when coalesce(array_length(v_lote, 1), 0) < 1000 or coalesce(array_length(v_ids, 1), 0) >= 20000;
    v_desde := v_desde + 1000;
  end loop;
  return v_ids[1:20000];
end;
$$;

revoke all on function public.fn_clientes_ids(integer, integer, text, text, text, text, uuid, text, text) from public, anon;
grant execute on function public.fn_clientes_ids(integer, integer, text, text, text, text, uuid, text, text) to authenticated, service_role;
-- La guarda de permisos interna no necesita ser invocable desde la API.
revoke execute on function public.fn_clientes_exigir_permiso(integer, text[]) from authenticated;
