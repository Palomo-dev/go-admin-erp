-- Vuelve fn_reporte_stock_sin_seriales al cuerpo de 20261023045506 (sin pp_elim).
-- Solo reemplaza la función de lectura. No inserta ni borra seriales.

create or replace function public.fn_reporte_stock_sin_seriales(p_org integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_filas jsonb;
begin
  if p_org is null then
    raise exception 'organizacion_requerida' using errcode = '22023';
  end if;
  perform public.fn_seriales_int_exigir(p_org, false);
  select coalesce((
    select jsonb_agg(to_jsonb(q) order by q.sin_serial desc, q.product_id, q.branch_id)
      from (
        select st.product_id,
               p.sku,
               p.name as nombre,
               st.branch_id,
               b.name as sucursal,
               st.qty as qty_on_hand,
               coalesce(se.ocupando, 0) as seriales,
               coalesce(se.disponibles, 0) as seriales_disponibles,
               (st.qty - coalesce(se.ocupando, 0)) as sin_serial
          from (
            select sl.product_id, sl.branch_id, sum(sl.qty_on_hand) as qty
              from public.stock_levels sl
              join public.products p2 on p2.id = sl.product_id
             where p2.organization_id = p_org
               and p2.track_serial is true
               and coalesce(p2.track_stock, false) is true
             group by sl.product_id, sl.branch_id
          ) st
          join public.products p on p.id = st.product_id and p.organization_id = p_org
          join public.branches b on b.id = st.branch_id and b.organization_id = p_org
          left join (
            select s.product_id,
                   coalesce(s.current_branch_id, s.branch_id) as branch_id,
                   count(*) filter (where s.status in ('in_stock', 'reserved'))::integer as ocupando,
                   count(*) filter (where s.status = 'in_stock')::integer as disponibles
              from public.serial_numbers s
             where s.organization_id = p_org
             group by s.product_id, coalesce(s.current_branch_id, s.branch_id)
          ) se on se.product_id = st.product_id and se.branch_id = st.branch_id
         where st.qty > coalesce(se.ocupando, 0)
      ) q
  ), '[]'::jsonb)
    into v_filas;
  return v_filas;
end;
$$;
