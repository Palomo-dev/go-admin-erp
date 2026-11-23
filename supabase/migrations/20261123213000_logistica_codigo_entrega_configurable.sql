-- Logística: «Pedir código de entrega en contraentrega» pasa a ser un ajuste (2026-11-23).
--
-- Figma «22 Logística», sección 10 (Configuración › Logística, 2933:9477): el código de 4 dígitos
-- en contraentrega propia es un interruptor de la organización, encendido por defecto. Hasta hoy
-- lo emitía siempre `trg_shipments_codigo_requerido`.
--
-- El ajuste vive en `organization_settings` (clave `logistica`, campo `codigoEntregaContraentrega`),
-- que solo escribe `PUT /api/logistica/ajustes` con el permiso `organization_settings` resuelto en
-- el servidor. Sin fila o sin el campo → encendido (como hasta hoy). Solo cambia lo que se crea o
-- cambia DESPUÉS de apagarlo: los códigos ya emitidos se conservan.
--
-- Rollback: supabase/rollbacks/20261123213000_logistica_codigo_entrega_configurable_rollback.sql

create or replace function public.fn_logistica_pide_codigo_entrega(p_org integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select (s.settings ->> 'codigoEntregaContraentrega') <> 'false'
       from public.organization_settings s
      where s.organization_id = p_org and s.key = 'logistica'
      limit 1),
    true
  );
$$;

revoke all on function public.fn_logistica_pide_codigo_entrega(integer) from public, anon;
grant execute on function public.fn_logistica_pide_codigo_entrega(integer) to authenticated, service_role;

comment on function public.fn_logistica_pide_codigo_entrega(integer) is
  'Configuración › Logística: ¿se pide código de entrega en contraentrega propia? organization_settings[logistica].codigoEntregaContraentrega; sin dato → true. Solo devuelve un booleano de la organización indicada.';

create or replace function public.fn_shipments_marcar_codigo_requerido()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.delivery_code_required := (
    new.fulfillment_mode = 'own'
    and coalesce(new.cod_amount, 0) > 0
    and public.fn_logistica_pide_codigo_entrega(new.organization_id)
  );
  return new;
end;
$$;
revoke execute on function public.fn_shipments_marcar_codigo_requerido() from public, anon, authenticated;

comment on column public.shipments.delivery_code_required is
  'Lo calcula trg_shipments_codigo_requerido: contraentrega propia (cod_amount > 0 y fulfillment_mode = own) y la organización pide el código (Configuración › Logística, encendido por defecto).';
