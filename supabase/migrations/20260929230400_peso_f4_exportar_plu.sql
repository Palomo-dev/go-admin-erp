-- Productos por peso, fase 4: «Exportar PLU» para cargar la balanza etiquetadora
-- (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.3, §2.7).
--
-- Una fila por producto activo con PLU: PLU, nombre, precio vigente por la
-- unidad de venta (por kg; fn_pos_precio_base_vigente, la misma regla del
-- checkout), unidad, tara por defecto y días de vida. products no tiene hoy
-- una columna de vida útil: dias_vida sale NULL (columna vacía en el CSV)
-- hasta que exista. El CSV lo arma el navegador; aquí solo los datos.
-- Permiso pos.basculas.configurar resuelto en el servidor.

create or replace function public.fn_productos_exportar_plu(p_org integer)
returns table (
  plu integer,
  product_id integer,
  nombre text,
  precio_por_unidad numeric,
  unidad text,
  tara numeric,
  dias_vida integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.fn_assert_acceso_org(p_org);
  if not public.fn_tiene_permiso(p_org, 'pos.basculas.configurar') then
    raise exception 'sin_permiso: configurar básculas y etiquetas de peso' using errcode = '42501';
  end if;

  return query
  select p.scale_plu,
         p.id,
         p.name,
         public.fn_pos_precio_base_vigente(p.id, now()),
         btrim(p.unit_code)::text,
         p.default_tare_qty,
         null::integer
    from public.products p
   where p.organization_id = p_org
     and p.scale_plu is not null
     and coalesce(p.status, 'active') = 'active'
   order by p.scale_plu;
end;
$$;

revoke all on function public.fn_productos_exportar_plu(integer) from public, anon;
grant execute on function public.fn_productos_exportar_plu(integer) to authenticated, service_role;
