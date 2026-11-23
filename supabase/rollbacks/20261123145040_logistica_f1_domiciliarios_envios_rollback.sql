-- Reversión de 20261123145040_logistica_f1_domiciliarios_envios.sql (logística Fase 1, 1/5).
--
-- ADVERTENCIA: no restaura datos.
-- - Borra las columnas nuevas de shipments, driver_credentials, delivery_attempts,
--   proof_of_delivery y transport_events con lo que tengan. El conductor y el vehículo siguen en
--   shipments.metadata (las RPC logistica_* escriben el espejo), así que la asignación se conserva.
-- - Borra shipment_delivery_codes: se pierden los códigos de entrega emitidos.
-- - Volver a poner NOT NULL en driver_credentials falla si hay domiciliarios externos (sin
--   employment_id o sin licencia): bórrelos o complételos antes.
-- - Los CHECK de estados vuelven a la lista vieja: falla si hay envíos en ready_for_pickup o
--   failed_attempt, o eventos con esos estados canónicos. Páselos antes a 'ready'/'failed' y
--   'exception'.
-- Revertir antes las migraciones 2/5 a 5/5 (dependen de estas columnas).

drop trigger if exists trg_shipments_codigo_entrega on public.shipments;
drop trigger if exists trg_shipments_codigo_requerido on public.shipments;
drop function if exists public.fn_shipments_crear_codigo_entrega();
drop function if exists public.fn_shipments_marcar_codigo_requerido();
drop function if exists public.fn_logistica_codigo_4_digitos();
drop table if exists public.shipment_delivery_codes;

alter table public.proof_of_delivery drop constraint if exists proof_of_delivery_cod_collected_method_check;
alter table public.proof_of_delivery
  drop column if exists courier_id,
  drop column if exists delivery_code_verified,
  drop column if exists cod_collected_amount,
  drop column if exists cod_collected_method;

alter table public.delivery_attempts drop constraint if exists delivery_attempts_failure_reason_code_check;
alter table public.delivery_attempts add constraint delivery_attempts_failure_reason_code_check
  check (failure_reason_code = any (array['not_home', 'wrong_address', 'incomplete_address', 'rejected', 'damaged',
    'access_denied', 'business_closed', 'weather', 'vehicle_issue', 'customer_request', 'other']));
alter table public.delivery_attempts drop column if exists courier_id;

alter table public.transport_events drop constraint if exists transport_events_reason_code_check;
alter table public.transport_events drop column if exists reason_code;
alter table public.transport_events drop constraint if exists transport_events_canonical_status_check;
alter table public.transport_events add constraint transport_events_canonical_status_check
  check (canonical_status is null or canonical_status = any (array['created', 'assigned', 'picked', 'in_transit',
    'out_for_delivery', 'delivered', 'exception', 'returned', 'cancelled']));

drop index if exists public.idx_shipments_sale_unique;
drop index if exists public.idx_shipments_driver_cod;
alter table public.shipments drop constraint if exists shipments_status_check;
alter table public.shipments add constraint shipments_status_check
  check (status = any (array['draft', 'pending', 'assigned', 'ready', 'picked', 'dispatched', 'in_transit',
    'out_for_delivery', 'delivered', 'failed', 'returned', 'cancelled']));
alter table public.shipments drop constraint if exists shipments_fulfillment_mode_check;
alter table public.shipments drop constraint if exists shipments_exception_reason_check;
alter table public.shipments drop constraint if exists shipments_cod_collected_method_check;
alter table public.shipments
  drop column if exists driver_id,
  drop column if exists vehicle_id,
  drop column if exists assigned_at,
  drop column if exists fulfillment_mode,
  drop column if exists exception_reason,
  drop column if exists exception_detail,
  drop column if exists failed_attempts,
  drop column if exists cod_collected_amount,
  drop column if exists cod_collected_method,
  drop column if exists cod_collected_at,
  drop column if exists cod_remitted_at,
  drop column if exists delivery_code_required;

-- driver_credentials: política anterior (anidada) y NOT NULL de antes.
drop policy if exists driver_credentials_miembros on public.driver_credentials;
create policy driver_credentials_org_access on public.driver_credentials
  for all to public
  using (employment_id in (select e.id from public.employments e
                            join public.organization_members om on e.organization_member_id = om.id
                           where om.organization_id in (select organization_members.organization_id
                                                          from public.organization_members
                                                         where organization_members.user_id = auth.uid())));
drop trigger if exists trg_driver_credentials_completar on public.driver_credentials;
drop function if exists public.fn_driver_credentials_completar();
drop index if exists public.uq_driver_credentials_org_user;
alter table public.driver_credentials drop constraint if exists driver_credentials_vehicle_type_check;
alter table public.driver_credentials drop constraint if exists driver_credentials_identidad_check;
alter table public.driver_credentials drop constraint if exists driver_credentials_organizacion_check;
alter table public.driver_credentials
  drop column if exists organization_id,
  drop column if exists branch_id,
  drop column if exists user_id,
  drop column if exists full_name,
  drop column if exists phone,
  drop column if exists document_type,
  drop column if exists document_number,
  drop column if exists is_external,
  drop column if exists vehicle_type;
alter table public.driver_credentials alter column employment_id set not null;
alter table public.driver_credentials alter column license_number set not null;
alter table public.driver_credentials alter column license_category set not null;
alter table public.driver_credentials alter column license_expiry set not null;
