-- Inventario B8 · Compras ↔ inventario: documento de recepción de la orden de
-- compra (INVENTARIO-PLAN.md §5.9).
--
-- Estado de hoy (2026-09-29): la recepción de una OC se hacía en el navegador
-- (purchaseOrderService.receiveItems / receiveItemsWithSerials): UPDATE directo
-- de received_quantity línea por línea, sin transacción; el stock por otra
-- llamada cuyos errores solo iban a la consola («no bloquea la recepción»); los
-- seriales uno a uno con sus errores también en la consola; sin lote ni
-- vencimiento, y sin ningún documento que diga qué llegó en cada entrega.
--
-- Qué cambia (aditivo; tablas nuevas, ninguna existente se toca):
-- * purchase_receipts: una fila por recepción (REC-0001 por organización), con
--   la clave de idempotencia (repetir la misma recepción devuelve el mismo
--   resultado sin mover nada) y el resultado que devolvió la RPC.
-- * purchase_receipt_items: qué entró de cada línea de la OC en esa recepción,
--   por lote: cantidad, costo del proveedor, lote, seriales, movimiento de
--   kardex y la foto «pedido / recibido antes» para la diferencia con la orden.
-- RLS de solo lectura para miembros activos: solo fn_oc_recepcionar (DEFINER)
-- escribe.

create table if not exists public.purchase_receipts (
  id bigserial primary key,
  organization_id integer not null references public.organizations(id) on delete cascade,
  purchase_order_id integer not null references public.purchase_orders(id) on delete cascade,
  branch_id integer not null references public.branches(id),
  code text not null,
  idempotency_key text not null,
  notes text,
  purchase_invoice_id uuid references public.invoice_purchase(id) on delete set null,
  resultado jsonb not null default '{}'::jsonb,
  received_by uuid default auth.uid() references auth.users(id) on delete set null,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table public.purchase_receipts is 'Recepciones de órdenes de compra (una por entrega). Solo la escribe fn_oc_recepcionar.';
comment on column public.purchase_receipts.code is 'Código legible por organización (REC-0001).';
comment on column public.purchase_receipts.idempotency_key is 'Clave de idempotencia del cliente: la misma clave devuelve la misma recepción sin mover stock otra vez.';
comment on column public.purchase_receipts.purchase_invoice_id is 'Factura de compra generada al completar la orden con esta recepción (fn_factura_compra_desde_oc).';
comment on column public.purchase_receipts.resultado is 'Respuesta de fn_oc_recepcionar, para devolverla igual si se repite la clave.';

create unique index if not exists purchase_receipts_org_code_key
  on public.purchase_receipts (organization_id, code);
create unique index if not exists purchase_receipts_org_clave_key
  on public.purchase_receipts (organization_id, idempotency_key);
create index if not exists idx_purchase_receipts_orden
  on public.purchase_receipts (purchase_order_id, received_at desc, id desc);

create table if not exists public.purchase_receipt_items (
  id bigserial primary key,
  receipt_id bigint not null references public.purchase_receipts(id) on delete cascade,
  organization_id integer not null references public.organizations(id) on delete cascade,
  purchase_order_item_id integer references public.purchase_order_items(id) on delete set null,
  product_id integer not null references public.products(id),
  qty numeric not null check (qty > 0),
  unit_cost numeric not null default 0,
  lot_id integer references public.lots(id) on delete set null,
  serial_ids integer[] not null default '{}'::integer[],
  movement_id integer references public.stock_movements(id) on delete set null,
  ordered_qty numeric not null,
  received_before numeric not null,
  created_at timestamptz not null default now()
);

comment on table public.purchase_receipt_items is 'Qué entró de cada línea de la OC en una recepción, por lote. Solo lo escribe fn_oc_recepcionar.';
comment on column public.purchase_receipt_items.unit_cost is 'Costo del proveedor con el que entró (el de la línea de la orden); el promedio lo calcula fn_inv_int_mover.';
comment on column public.purchase_receipt_items.serial_ids is 'Seriales (serial_numbers.id) recibidos en esta fila.';
comment on column public.purchase_receipt_items.movement_id is 'Movimiento de kardex (stock_movements) de esta fila; NULL si el producto no controla stock.';
comment on column public.purchase_receipt_items.ordered_qty is 'Cantidad pedida en la línea de la orden al recibir.';
comment on column public.purchase_receipt_items.received_before is 'Cantidad ya recibida de la línea antes de esta recepción.';

create index if not exists idx_purchase_receipt_items_recepcion
  on public.purchase_receipt_items (receipt_id, id);
create index if not exists idx_purchase_receipt_items_linea
  on public.purchase_receipt_items (purchase_order_item_id);
create index if not exists idx_purchase_receipt_items_org
  on public.purchase_receipt_items (organization_id);
create index if not exists idx_purchase_receipt_items_lote
  on public.purchase_receipt_items (lot_id) where lot_id is not null;

alter table public.purchase_receipts enable row level security;
alter table public.purchase_receipt_items enable row level security;

drop policy if exists purchase_receipts_lectura_miembros on public.purchase_receipts;
create policy purchase_receipts_lectura_miembros on public.purchase_receipts
  for select to authenticated
  using (organization_id in (select om.organization_id
                               from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active = true));

drop policy if exists purchase_receipt_items_lectura_miembros on public.purchase_receipt_items;
create policy purchase_receipt_items_lectura_miembros on public.purchase_receipt_items
  for select to authenticated
  using (organization_id in (select om.organization_id
                               from public.organization_members om
                              where om.user_id = (select auth.uid()) and om.is_active = true));

revoke all on table public.purchase_receipts from anon;
revoke all on table public.purchase_receipt_items from anon;
revoke insert, update, delete, truncate on table public.purchase_receipts from authenticated;
revoke insert, update, delete, truncate on table public.purchase_receipt_items from authenticated;
grant select on table public.purchase_receipts to authenticated;
grant select on table public.purchase_receipt_items to authenticated;
revoke all on sequence public.purchase_receipts_id_seq from anon, authenticated;
revoke all on sequence public.purchase_receipt_items_id_seq from anon, authenticated;
