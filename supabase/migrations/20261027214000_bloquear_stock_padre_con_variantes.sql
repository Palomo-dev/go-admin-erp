-- Un producto padre que tiene variantes no lleva existencias propias: el stock va en cada variante.
-- Solo hacia adelante: NO se toca el stock ya existente de los ~12.107 padres (se reporta aparte).
-- Se bloquean las entradas nuevas (ajuste, carga inicial, compra, producción, traslado) y crear
-- un stock_levels con cantidad en el padre. Se permiten las salidas y las reversas (devolución,
-- anulación de factura, nota crédito) para poder vaciar y corregir lo heredado.
create or replace function public.fn_bloquear_stock_padre_variantes()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_tiene_variantes boolean;
begin
  if tg_table_name = 'stock_movements' then
    if new.direction is distinct from 'in' or coalesce(new.source, '') in ('return', 'invoice_void', 'credit_note') then
      return new;
    end if;
  elsif coalesce(new.qty_on_hand, 0) <= 0 then
    return new;
  end if;

  select exists(select 1 from public.products v where v.parent_product_id = new.product_id) into v_tiene_variantes;
  if v_tiene_variantes then
    raise exception 'producto_padre_con_variantes: el producto % tiene variantes; registra las existencias en cada variante, no en el padre.', new.product_id
      using errcode = 'P0001', hint = 'Elige la variante (talla, color…) al cargar o ajustar el inventario.';
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
