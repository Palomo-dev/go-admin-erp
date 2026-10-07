-- ============================================================================
-- Carta QR · «Pagar en la mesa» (payment_method 'mesa') cuenta como método nativo
--
-- Los pedidos de la Carta QR se crean con payment_method 'mesa'. fn_web_order_metodo_nativo
-- solo reconocía 'cash', 'transfer' y los métodos sin pasarela de
-- organization_payment_methods, así que un pedido «en la mesa»:
--   - no avisaba en la campana al insertarse (fn_notify_web_order_created), y
--   - expire_pending_web_orders lo expiraba con el plazo corto de pasarela (30 min).
-- Caso real (org 140, 2026-10-07): dos rondas de la Mesa 3 sin ningún aviso.
--
-- Ensayo (do $$ … raise exception 'ENSAYO_OK' $$): mesa=t cash=t wompi_co=f.
-- Aplicada el 2026-10-07 con apply_migration (versión 20261007165402).
-- ============================================================================
set lock_timeout = '10s';
create or replace function public.fn_web_order_metodo_nativo(p_organization_id integer, p_metodo text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  -- 'mesa' = «Pagar en la mesa» de la Carta QR: no pasa por pasarela, igual
  -- que efectivo y transferencia (avisa al insertar y no expira a los 30 min).
  select coalesce(p_metodo, '') in ('cash', 'transfer', 'mesa')
      or exists (
           select 1
             from public.organization_payment_methods opm
            where opm.organization_id = p_organization_id
              and opm.payment_method_code = p_metodo
              and opm.integration_connection_id is null
         );
$function$;
