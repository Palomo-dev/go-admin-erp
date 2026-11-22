-- Reventa de una devolución (Figma 2719:190584, «Registrar venta nueva»).
--
-- Cuando la nota crédito de una devolución ya fue aceptada por la DIAN, la
-- devolución no se anula: si el cliente se queda otra vez con el producto se
-- registra una venta NUEVA con factura nueva. Esa venta guarda qué devolución
-- revende, para la cadena Venta → Devolución → NC → Venta nueva.
--
-- Dirección del enlace: sales → returns (`sales.resale_of_return_id`). La
-- escribe el único camino que crea la venta del POS (`pos_checkout_v1`) en el
-- mismo INSERT, sin tocar la fila de la devolución (que tiene su propio
-- disparador contable) ni hacer un UPDATE posterior sobre sales (que volvería a
-- disparar los disparadores diferidos de la venta). Un carrito abandonado no
-- crea venta y no enlaza nada.
--
-- pos_checkout_v1 (≈ 50 KB) se parchea en su sitio con dos reemplazos exactos
-- sobre su definición viva, cada uno verificado (una sola aparición del
-- ancla). Idempotente: si ya tiene resale_of_return_id no hace nada. El
-- rollback hace los reemplazos inversos. El sobre del navegador lleva
-- `resale_of_return_id` solo en una venta nueva; la función lo valida
-- (`fn_venta_reventa_de`: misma organización y devolución procesada) y, si no
-- vale, la venta se crea igual sin enlace.

alter table public.sales add column if not exists resale_of_return_id integer
  references public.returns(id) on delete set null;
comment on column public.sales.resale_of_return_id is
  'Devolución que esta venta revende («Registrar venta nueva» cuando la nota crédito ya fue aceptada por la DIAN). La escribe pos_checkout_v1 desde el sobre.';
create index if not exists idx_sales_resale_of_return_id on public.sales (resale_of_return_id)
  where resale_of_return_id is not null;

create or replace function public.fn_venta_reventa_de(p_org integer, p_envelope jsonb)
returns integer
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_texto text := btrim(coalesce(p_envelope->>'resale_of_return_id', ''));
  v_id integer;
begin
  if v_texto !~ '^[0-9]{1,9}$' then
    return null;
  end if;
  select r.id into v_id from public.returns r
   where r.id = v_texto::integer and r.organization_id = p_org and r.status = 'processed';
  return v_id;
end;
$$;

comment on function public.fn_venta_reventa_de(integer, jsonb) is
  'Devolución que revende la venta del sobre de pos_checkout_v1 (resale_of_return_id), o NULL si no es de la organización o no está procesada. Solo la llama pos_checkout_v1.';

revoke all on function public.fn_venta_reventa_de(integer, jsonb) from public, anon, authenticated;

do $parche$
declare
  v_def text := pg_get_functiondef('public.pos_checkout_v1'::regproc);
  v_ancla_cols constant text := E'time_review_reason\n      ) values (';
  v_ancla_vals constant text := E'        v_revision\n      ) returning * into v_sale;';
  v_nuevo text;
begin
  if position('resale_of_return_id' in v_def) > 0 then
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_ancla_cols, ''))) / length(v_ancla_cols) <> 1
     or (length(v_def) - length(replace(v_def, v_ancla_vals, ''))) / length(v_ancla_vals) <> 1 then
    raise exception 'pos_checkout_v1 cambió: las anclas del INSERT de sales no aparecen una sola vez';
  end if;
  v_nuevo := replace(v_def, v_ancla_cols, E'time_review_reason, resale_of_return_id\n      ) values (');
  v_nuevo := replace(v_nuevo, v_ancla_vals,
    E'        v_revision,\n'
    || E'        -- Reventa de una devolución: solo si es de la organización y sigue procesada.\n'
    || E'        public.fn_venta_reventa_de(v_org, p_envelope)\n'
    || E'      ) returning * into v_sale;');
  execute v_nuevo;
end;
$parche$;
