-- Rollback de 20260924001000_clientes_listado_estado_y_acciones.sql
--
-- ADVERTENCIA: quitar customers.status e inactivated_at PIERDE qué clientes se
-- marcaron inactivos y cuándo. Antes de revertir, si hace falta conservarlo:
--   select id, status, inactivated_at from public.customers where status <> 'active';
-- Los clientes eliminados con fn_clientes_eliminar no se restauran (el borrado
-- solo alcanzó a clientes sin ninguna relación).
-- Las etiquetas y roles cambiados en bloque quedan como están.

drop function if exists public.fn_clientes_eliminar(integer, uuid[], boolean);
drop function if exists public.fn_clientes_cambiar_estado(integer, uuid[], text);
drop function if exists public.fn_clientes_rol_masivo(integer, uuid[], text, boolean);
drop function if exists public.fn_clientes_etiqueta_masiva(integer, uuid[], text, boolean);
drop function if exists public.fn_clientes_opciones_filtro(integer);
drop function if exists public.fn_clientes_resumen(integer, integer);
drop function if exists public.fn_clientes_listado(integer, integer, text, text, text, text, uuid, text, text, text, text, integer, integer, uuid[]);
drop function if exists public.fn_clientes_exigir_permiso(integer, text[]);

drop index if exists public.idx_sales_customer_id;
drop index if exists public.idx_customers_org_status;

alter table public.customers drop constraint if exists customers_status_check;
alter table public.customers drop column if exists inactivated_at;
alter table public.customers drop column if exists status;
