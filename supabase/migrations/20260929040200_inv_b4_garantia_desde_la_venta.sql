-- Inventario B4 · P9: la garantía de un serial empieza el día de la venta.
--
-- Un solo disparador sobre serial_numbers en lugar de corregir a cada escritor
-- (recepción de la OC y de la factura de compra, ajuste, «Generar seriales»
-- del producto, POS, factura de venta, pedido web, reemplazo de garantía):
--
-- * En bodega (`in_stock`, `reserved`, `in_transit`) no hay garantía corriendo:
--   warranty_start y warranty_end quedan nulos. El plazo (warranty_months) se
--   conserva.
-- * Al pasar a `sold` (o insertarse vendido), la garantía arranca el día de la
--   venta en la zona de la sucursal (o de la organización): warranty_start =
--   día de sale_date (o de ahora), warranty_end = + warranty_months (o el plazo
--   del producto). Si quien vende fija la garantía explícitamente en el mismo
--   UPDATE, se respeta.
-- * Volver a `sold` desde un reclamo (reparado, rechazado) recalcula con la
--   misma sale_date: la garantía original sigue; un reemplazo trae sale_date
--   nueva y con ella garantía nueva.
--
-- No mueve stock. Sin CURRENT_DATE (zona del servidor): el día sale de now()
-- en la zona de la sucursal/organización, America/Bogota solo como respaldo.

create or replace function public.fn_serial_int_garantia_desde_venta()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_meses integer;
  v_zona text;
  v_dia date;
begin
  if new.status in ('in_stock', 'reserved', 'in_transit') then
    new.warranty_start := null;
    new.warranty_end := null;
    return new;
  end if;

  if new.status = 'sold' and (tg_op = 'INSERT' or old.status is distinct from 'sold') then
    if tg_op = 'UPDATE'
       and new.warranty_start is not null
       and (new.warranty_start is distinct from old.warranty_start
            or new.warranty_end is distinct from old.warranty_end) then
      return new;
    end if;

    v_meses := coalesce(new.warranty_months,
                        (select p.warranty_months from public.products p where p.id = new.product_id));
    if coalesce(v_meses, 0) <= 0 then
      new.warranty_start := null;
      new.warranty_end := null;
      return new;
    end if;

    select coalesce(nullif(btrim(b.timezone), ''), nullif(btrim(o.timezone), ''), 'America/Bogota')
      into v_zona
      from public.organizations o
      left join public.branches b
        on b.id = coalesce(new.current_branch_id, new.branch_id)
       and b.organization_id = o.id
     where o.id = new.organization_id;

    begin
      v_dia := (coalesce(new.sale_date, now()) at time zone coalesce(v_zona, 'America/Bogota'))::date;
    exception when others then
      v_dia := (coalesce(new.sale_date, now()) at time zone 'America/Bogota')::date;
    end;

    new.warranty_months := v_meses;
    new.warranty_start := v_dia;
    new.warranty_end := (v_dia + make_interval(months => v_meses))::date;
  end if;

  return new;
end;
$$;

comment on function public.fn_serial_int_garantia_desde_venta() is
  'Inventario B4 (P9): en bodega no corre garantía; al venderse arranca el día de la venta con warranty_months (o el plazo del producto).';

revoke all on function public.fn_serial_int_garantia_desde_venta() from public, anon, authenticated;

drop trigger if exists trg_serial_garantia_desde_venta on public.serial_numbers;
create trigger trg_serial_garantia_desde_venta
  before insert or update of status, sale_date, warranty_months, warranty_start, warranty_end
  on public.serial_numbers
  for each row execute function public.fn_serial_int_garantia_desde_venta();
