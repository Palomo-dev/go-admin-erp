-- Rollback de 20260924031326_factus_servicio_plataforma_cola.
--
-- ADVERTENCIA: borra las columnas añadidas. Se pierden, sin forma de
-- recuperarlas desde aquí: el estado electrónico de los documentos
-- (invoice_sales.einvoice_status / einvoice_number / einvoice_qr), el estado
-- del servicio por organización y el vínculo a las credenciales en Vault.
-- Los secretos 'factus_credenciales_org_<id>' de vault.secrets NO se borran
-- (bórrelos a mano si de verdad hay que retirarlos). El CUFE queda en
-- invoice_sales.xml_uuid, que ya existía.

-- Funciones nuevas
drop function if exists public.fn_einvoicing_registrar_resultado(uuid, text, text, boolean, timestamptz, text, jsonb, jsonb, text, text, text, text, timestamptz, text, text, jsonb);
drop function if exists public.fn_einvoicing_reclamar_jobs(text, integer, uuid);
drop function if exists public.fn_factus_servicio_estado(integer, text, uuid, text, boolean, text);
drop function if exists public.fn_factus_credenciales_leer(integer, boolean);
drop function if exists public.fn_factus_credenciales_guardar(integer, text, text, text, text, text);

-- Trigger de estados de la cola: versión anterior (sin organization_id y
-- registrando también las transiciones de 'processing').
create or replace function public.fn_ei_jobs_status_change()
returns trigger
language plpgsql
as $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO electronic_invoicing_events (job_id, event_type, event_code, event_message, metadata)
        VALUES (
            NEW.id,
            CASE
                WHEN NEW.status = 'accepted' THEN 'accepted'
                WHEN NEW.status = 'rejected' THEN 'rejected'
                WHEN NEW.status = 'sent' THEN 'sent'
                WHEN NEW.status = 'failed' THEN 'error'
                WHEN NEW.status = 'cancelled' THEN 'cancelled'
                ELSE 'notification'
            END,
            NEW.error_code,
            COALESCE(NEW.error_message, 'Estado cambiado a ' || NEW.status),
            jsonb_build_object('old_status', OLD.status, 'new_status', NEW.status, 'attempt', NEW.attempt_count)
        );
    END IF;
    RETURN NEW;
END;
$$;

-- Cola
drop index if exists public.uq_ei_jobs_documento_soporte_vivo;
drop index if exists public.uq_ei_jobs_documento_vivo;
drop index if exists public.idx_ei_jobs_reference_code;
alter table public.electronic_invoicing_jobs
  drop column if exists locked_by,
  drop column if exists locked_at,
  drop column if exists reference_code;

-- Estado electrónico del documento
alter table public.invoice_sales drop constraint if exists invoice_sales_einvoice_status_check;
alter table public.invoice_sales
  drop column if exists einvoice_qr,
  drop column if exists einvoice_number,
  drop column if exists einvoice_status;

-- Configuración por organización: permisos y política anteriores
drop trigger if exists trg_eic_sin_secretos_en_claro on public.electronic_invoicing_config;
drop function if exists public.fn_eic_sin_secretos_en_claro();
drop policy if exists eic_select_miembros on public.electronic_invoicing_config;
create policy "Users can manage their org e-invoicing config" on public.electronic_invoicing_config
  for all to public
  using (organization_id in (
    select om.organization_id from organization_members om join auth.users u on u.id = om.user_id where u.id = auth.uid()))
  with check (organization_id in (
    select om.organization_id from organization_members om join auth.users u on u.id = om.user_id where u.id = auth.uid()));
grant all on public.electronic_invoicing_config to anon, authenticated;

alter table public.electronic_invoicing_config drop constraint if exists electronic_invoicing_config_service_status_check;
alter table public.electronic_invoicing_config
  drop column if exists last_check_message,
  drop column if exists last_check_ok,
  drop column if exists last_check_at,
  drop column if exists activated_by,
  drop column if exists activated_at,
  drop column if exists factus_company_nit,
  drop column if exists credentials_secret_id,
  drop column if exists service_status;

comment on column public.electronic_invoicing_config.client_secret is null;
comment on column public.electronic_invoicing_config.password is null;
