-- fn_seriales_descuadre deja fuera la variante cuyo padre está eliminado.
-- La migración 20261023021637 ya está aplicada: no se reescribe.
-- Reversión: el rollback vuelve al cuerpo anterior, sin pp_elim.

create or replace function public.fn_seriales_descuadre(p_org integer)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  perform public.fn_inventario_exigir_permiso(p_org, array['ver']);
  return coalesce((
    with stock as (
      select p.id as product_id, p.name as producto, p.sku,
             b.id as branch_id, b.name as sede,
             sum(sl.qty_on_hand) as stock
        from public.products p
        join public.stock_levels sl on sl.product_id = p.id
        join public.branches b
          on b.id = sl.branch_id and b.organization_id = p.organization_id
       where p.organization_id = p_org
         and coalesce(p.track_serial, false)
         and not exists (
           select 1 from public.products pp_elim
            where pp_elim.id = p.parent_product_id
              and pp_elim.status = 'deleted'
         )
       group by p.id, p.name, p.sku, b.id, b.name
    ),
    seriales as (
      select sn.product_id,
             coalesce(sn.current_branch_id, sn.branch_id) as branch_id,
             count(*)::integer as n
        from public.serial_numbers sn
       where sn.organization_id = p_org
         and sn.status in ('in_stock', 'reserved')
       group by sn.product_id, coalesce(sn.current_branch_id, sn.branch_id)
    )
    select jsonb_agg(jsonb_build_object(
             'product_id', s.product_id,
             'producto', s.producto,
             'sku', s.sku,
             'branch_id', s.branch_id,
             'sede', s.sede,
             'stock', s.stock,
             'seriales', coalesce(n.n, 0),
             'sin_serial', floor(s.stock) - coalesce(n.n, 0)
           ) order by (floor(s.stock) - coalesce(n.n, 0)) desc, s.producto)
      from stock s
      left join seriales n
        on n.product_id = s.product_id and n.branch_id = s.branch_id
     where floor(s.stock) <> coalesce(n.n, 0)
  ), '[]'::jsonb);
end;
$function$;

comment on function public.fn_seriales_descuadre(integer) is
  'Por producto y sede: unidades en stock menos seriales en bodega (in_stock o reserved). Positivo: faltan seriales. Negativo: hay más seriales que stock. Excluye la variante de un padre eliminado. No escribe inventario.';
