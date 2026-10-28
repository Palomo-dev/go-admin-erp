-- Un producto padre que tiene variantes no lleva existencias propias: el stock va en cada variante.
-- Solo hacia adelante: NO se toca el stock ya existente de los ~12.107 padres (se reporta aparte).
-- Se bloquean las entradas nuevas (ajuste, carga inicial, compra, producción, traslado) y crear
-- un stock_levels con cantidad en el padre. Se permiten las salidas y las reversas (devolución,
-- anulación de factura, nota crédito) para poder vaciar y corregir lo heredado.
-- Antes de aplicarla: el ajuste/apertura masiva (bulkService) y el importador (validarFilas) ya no mandan
-- stock a padres con variantes, que eran el 100 % de las 5.980 entradas a padres del último mes.
-- SIN APLICAR.
create or replace function public.fn_bloquear_stock_padre_variantes()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tiene_variantes boolean;
  v_nombre text;
  v_sku text;
begin
  if tg_table_name = 'stock_movements' then
    if new.direction is distinct from 'in' or coalesce(new.source, '') in ('return', 'invoice_void', 'credit_note') then
      return new;
    end if;
  elsif coalesce(new.qty_on_hand, 0) <= 0 then
    return new;
  end if;

  -- Solo cuentan las variantes vivas: un padre cuyas variantes se eliminaron vuelve a llevar stock.
  select exists(select 1 from public.products v
                 where v.parent_product_id = new.product_id
                   and coalesce(v.status, 'active') <> 'deleted')
    into v_tiene_variantes;
  if v_tiene_variantes then
    select p.name, p.sku into v_nombre, v_sku from public.products p where p.id = new.product_id;
    raise exception 'producto_padre_con_variantes: «%» (SKU %) tiene variantes. El inventario se registra en cada variante (talla, color…), no en el producto padre.',
      coalesce(v_nombre, new.product_id::text), coalesce(v_sku, 'sin SKU')
      using errcode = 'P0001',
            hint = 'Carga o ajusta la cantidad en las variantes. El ajuste masivo y el importador ya omiten al padre y avisan.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_stock_padre_variantes on public.stock_movements;
create trigger trg_bloquear_stock_padre_variantes
  before insert on public.stock_movements
  for each row execute function public.fn_bloquear_stock_padre_variantes();

drop trigger if exists trg_bloquear_stock_padre_variantes on public.stock_levels;
create trigger trg_bloquear_stock_padre_variantes
  before insert on public.stock_levels
  for each row execute function public.fn_bloquear_stock_padre_variantes();
