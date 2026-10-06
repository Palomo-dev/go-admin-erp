-- Reversión de 20261007130100_pedido_web_cierra_con_la_mesa.sql
-- Quita los dos disparadores y sus funciones. No revierte datos: los pedidos
-- que ya pasaron a delivered/paid/cancelled al cerrar su mesa se quedan así.
set lock_timeout = '5s';

drop trigger if exists trg_web_orders_mesa_cerrada on public.table_sessions;
drop trigger if exists trg_web_orders_mesa_pagada on public.sales;
drop function if exists public.fn_trg_web_orders_mesa_cerrada();
drop function if exists public.fn_trg_web_orders_mesa_pagada();
drop function if exists public.fn_web_orders_sync_cuenta_mesa(uuid, boolean);
