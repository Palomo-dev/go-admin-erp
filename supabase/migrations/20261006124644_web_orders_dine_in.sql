-- ⚠️ SIN APLICAR (2026-10-07). Paquete E · E1 — «Comer aquí» (QR de mesa) en web_orders.
-- Va PRIMERO: desbloquea al paquete A (el sitio deja de mapear dine_in → pickup).
--
-- ENSAYO (2026-10-07, bloque `do` que aplica esta migración, prueba y se
-- deshace con `raise exception`, vía execute_sql, org 140 sede 115; el `drop
-- trigger if exists` se omitió en el bloque porque el trigger no existe y el
-- MCP se cuelga con él):
--   ENSAYO_OK violan=0 | dine_in tipo=dine_in mesa_ok=t |
--   reserve={"ok": true, "reservas": [], "sin_disponible": []} |
--   otra_org=[MESA_INVALIDA] | update_otra_org=[MESA_INVALIDA] | dur=52 ms
--   (violan = filas actuales que violarían el CHECK nuevo; reserve =
--   reserve_stock_for_web_order sobre un pedido dine_in; otra_org = insertar o
--   mover un pedido de la org 140 a una mesa de otra organización).
--
-- Problema: `web_orders_delivery_type_check` solo admite pickup, delivery_own y
-- delivery_third_party. Un pedido «Comer aquí» del QR de mesa (`dine_in`) viola
-- el CHECK y el sitio responde 500: el pedido en la mesa nunca se guarda. Y no
-- hay ningún enlace entre el pedido y la mesa ni con su sesión de POS.
--
-- Qué hace (todo aditivo):
-- 1. Reemplaza el CHECK añadiendo 'dine_in'. Solo amplía el dominio: ninguna
--    fila existente lo viola (se comprueba en el ensayo).
-- 2. `web_orders.restaurant_table_id uuid NULL` → restaurant_tables(id)
--    ON DELETE SET NULL. La mesa la resuelve SIEMPRE el servidor del sitio (por
--    organización y sede); nunca se toma del body sin validar.
-- 3. `web_orders.table_session_id uuid NULL` → table_sessions(id)
--    ON DELETE SET NULL. Lo llena `pos_mesa_agregar_pedido_web` (E3).
-- 4. Índices parciales sobre las dos columnas.
-- 5. Guarda `fn_web_orders_mesa_valida` (BEFORE INSERT/UPDATE OF
--    restaurant_table_id, branch_id): la mesa tiene que ser de la MISMA
--    organización y de la MISMA sede del pedido (`MESA_INVALIDA`). Es la red de
--    seguridad del multi-tenant: el sitio escribe con service role (sin RLS).
--
-- Verificado por MCP antes de escribirla (2026-10-07):
-- - restaurant_tables: PK `id uuid`, `organization_id integer NOT NULL`,
--   `branch_id integer NOT NULL`.
-- - table_sessions: PK `id uuid`.
-- - Ninguna función de public referencia `delivery_type`
--   (`fn_auto_journal_web_order`, `reserve_stock_for_web_order` y
--   `expire_pending_web_orders` no dependen del tipo de entrega): dine_in no
--   exige dirección en la base.
-- - Distribución actual: delivery_own=7015, pickup=11.
--
-- Contrato para el paquete A (websites, /api/orders):
--   delivery_type='dine_in', restaurant_table_id=<uuid resuelto en el servidor
--   contra restaurant_tables por organization_id + branch_id>, delivery_fee=0,
--   delivery_address='{}'. internal_notes conserva «[Comer aquí] Mesa: X».
--   Antes de que esta migración esté aplicada, A sigue con el mapeo temporal a
--   pickup.

alter table public.web_orders
  drop constraint if exists web_orders_delivery_type_check;
alter table public.web_orders
  add constraint web_orders_delivery_type_check
  check (delivery_type = any (array['pickup'::text, 'delivery_own'::text, 'delivery_third_party'::text, 'dine_in'::text]));

alter table public.web_orders
  add column if not exists restaurant_table_id uuid null
    references public.restaurant_tables(id) on delete set null;
alter table public.web_orders
  add column if not exists table_session_id uuid null
    references public.table_sessions(id) on delete set null;

comment on column public.web_orders.restaurant_table_id is
  'Mesa del pedido «Comer aquí» (dine_in). La resuelve el servidor del sitio por organización y sede. La guarda trg_web_orders_mesa_valida exige misma organización y sede.';
comment on column public.web_orders.table_session_id is
  'Sesión de mesa del POS a la que se agregó el pedido (pos_mesa_agregar_pedido_web).';

create index if not exists idx_web_orders_restaurant_table
  on public.web_orders (restaurant_table_id) where restaurant_table_id is not null;
create index if not exists idx_web_orders_table_session
  on public.web_orders (table_session_id) where table_session_id is not null;

create or replace function public.fn_web_orders_mesa_valida()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $f$
begin
  if new.restaurant_table_id is null then
    return new;
  end if;
  if not exists (
    select 1 from public.restaurant_tables rt
     where rt.id = new.restaurant_table_id
       and rt.organization_id = new.organization_id
       and rt.branch_id = new.branch_id
  ) then
    raise exception 'MESA_INVALIDA' using errcode = '23514',
      detail = 'La mesa no pertenece a la organización y sede del pedido.';
  end if;
  return new;
end;
$f$;

revoke all on function public.fn_web_orders_mesa_valida() from public, anon, authenticated;

drop trigger if exists trg_web_orders_mesa_valida on public.web_orders;
create trigger trg_web_orders_mesa_valida
  before insert or update of restaurant_table_id, branch_id, organization_id on public.web_orders
  for each row execute function public.fn_web_orders_mesa_valida();
