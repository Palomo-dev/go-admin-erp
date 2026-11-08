-- Ronda 2 del Contador (docs/contador/RESPUESTAS-CONTADOR-RONDA-2-2026-11-07.md, «responsabilidades históricas»):
-- «La reimpresión debe corresponder a los datos originales y al XML emitido.» Resolver por fecha con una vigencia
-- editable no basta: si alguien corrige la vigencia, el PDF de un documento viejo cambiaría.
-- ESCRITA, NO APLICADA. Se aplica por el MCP DESPUÉS de 20261108140500 (H2: fn_responsabilidades_fiscales_en).
-- Reversión: supabase/rollbacks/20261108161500_documentos_instantanea_partes_rollback.sql
--
-- document_party_snapshots: una INSTANTÁNEA por documento con los datos del emisor (organización, con las
-- responsabilidades vigentes en la fecha del documento) y del receptor (cliente o proveedor) tal como estaban al
-- EXPEDIRSE. La toman disparadores al pasar el documento a un estado expedido:
--   · invoice_sales (factura, nota crédito, nota débito; no proforma ni recurrente): status distinto de 'draft';
--   · support_documents (documento soporte; receptor = proveedor): status distinto de 'draft' y 'cancelled';
--   · quotations (cotización): status distinto de 'draft';
--   · payments (recibos y comprobantes; solo emisor): status 'completed'.
-- Coherencia con el XML: cuando el envío electrónico queda 'accepted', se guarda una sola vez el receptor TAL COMO SE
-- ENVIÓ (request_payload.customer o .provider) en receptor_xml; el PDF lo prefiere.
-- Inmutable: emisor, receptor y el documento no cambian nunca; receptor_xml solo pasa de NULL a un valor.
-- No hay relleno hacia atrás: un documento anterior no tiene instantánea, y el motor de PDF usa la respuesta guardada de
-- Factus si existe o, si no, la vigencia por fecha marcando el documento «reconstruido» (nunca se fabrica una
-- instantánea «de expedición» que no se tomó). Las ventas POS y lo registrado en Factus quedan como pendientes expresos.

create table if not exists public.document_party_snapshots (
  id uuid primary key default gen_random_uuid(),
  organization_id integer not null references public.organizations(id) on delete cascade,
  documento_tipo text not null
    check (documento_tipo in ('factura_venta', 'nota_credito', 'nota_debito', 'documento_soporte', 'cotizacion', 'recibo_pago')),
  documento_id uuid not null,
  fecha_documento date,
  emisor jsonb not null,
  receptor jsonb,
  receptor_xml jsonb,
  receptor_xml_en timestamptz,
  capturado_en timestamptz not null default now(),
  constraint document_party_snapshots_unico unique (documento_tipo, documento_id)
);

comment on table public.document_party_snapshots is
  'Datos del emisor y del receptor tal como estaban al expedir cada documento (reimpresión fiel). Inmutable; receptor_xml = receptor enviado a la DIAN.';

create index if not exists idx_document_party_snapshots_org on public.document_party_snapshots (organization_id, documento_tipo, documento_id);

alter table public.document_party_snapshots enable row level security;
drop policy if exists document_party_snapshots_select_miembros on public.document_party_snapshots;
create policy document_party_snapshots_select_miembros
  on public.document_party_snapshots
  for select
  to authenticated
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = (select auth.uid()) and om.is_active
    )
  );
revoke all on public.document_party_snapshots from anon;
revoke insert, update, delete, truncate, references, trigger on public.document_party_snapshots from authenticated;
grant select on public.document_party_snapshots to authenticated;

-- Inmutabilidad (también frente al rol de servicio y a las funciones con elevación).
create or replace function public.fn_document_party_snapshots_inmutable()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.organization_id is distinct from old.organization_id
     or new.documento_tipo is distinct from old.documento_tipo
     or new.documento_id is distinct from old.documento_id
     or new.fecha_documento is distinct from old.fecha_documento
     or new.emisor is distinct from old.emisor
     or new.receptor is distinct from old.receptor
     or new.capturado_en is distinct from old.capturado_en
     or (old.receptor_xml is not null and new.receptor_xml is distinct from old.receptor_xml) then
    raise exception 'INSTANTANEA_INMUTABLE' using errcode = '55000';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_document_party_snapshots_inmutable on public.document_party_snapshots;
create trigger trg_document_party_snapshots_inmutable
  before update on public.document_party_snapshots
  for each row execute function public.fn_document_party_snapshots_inmutable();

-- Emisor: la ficha de la organización con las responsabilidades del documento electrónico vigentes en la fecha.
create or replace function public.fn_document_snapshot_emisor(p_organization_id integer, p_fecha date)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
           'name', o.name, 'legal_name', o.legal_name, 'nit', o.nit, 'tax_id', o.tax_id, 'dv', o.dv,
           'address', o.address, 'city', o.city, 'state', o.state, 'phone', o.phone, 'email', o.email,
           'website', o.website, 'economic_activity', o.economic_activity, 'municipality_id', o.municipality_id,
           'fiscal_responsibilities', to_jsonb(public.fn_responsabilidades_fiscales_en(o.id, p_fecha))
         )
    from public.organizations o
   where o.id = p_organization_id;
$function$;

-- Día calendario de un instante en la zona de la organización.
create or replace function public.fn_document_snapshot_dia(p_organization_id integer, p_instante timestamptz)
returns date
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select (coalesce(p_instante, now()) at time zone coalesce(nullif(o.timezone, ''), 'America/Bogota'))::date
    from public.organizations o
   where o.id = p_organization_id;
$function$;

create or replace function public.fn_document_snapshot_guardar(
  p_organization_id integer, p_tipo text, p_id uuid, p_fecha date, p_receptor jsonb
)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $function$
  insert into public.document_party_snapshots (organization_id, documento_tipo, documento_id, fecha_documento, emisor, receptor)
  select p_organization_id, p_tipo, p_id, p_fecha, public.fn_document_snapshot_emisor(p_organization_id, p_fecha), p_receptor
   where public.fn_document_snapshot_emisor(p_organization_id, p_fecha) is not null
  on conflict (documento_tipo, documento_id) do nothing;
$function$;

create or replace function public.fn_document_snapshot_cliente(p_customer_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
           'full_name', c.full_name, 'company_name', c.company_name, 'first_name', c.first_name, 'last_name', c.last_name,
           'identification_type', c.identification_type, 'identification_number', c.identification_number,
           'doc_type', c.doc_type, 'doc_number', c.doc_number, 'dv', c.dv, 'address', c.address, 'city', c.city,
           'phone', c.phone, 'email', c.email, 'fiscal_responsibilities', to_jsonb(c.fiscal_responsibilities),
           'customer_type', c.customer_type
         )
    from public.customers c
   where c.id = p_customer_id;
$function$;

create or replace function public.fn_document_snapshot_proveedor(p_supplier_id integer)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
           'name', s.name, 'trade_name', s.trade_name, 'nit', s.nit, 'tax_id', s.tax_id, 'doc_type', s.doc_type, 'dv', s.dv,
           'address', s.address, 'city', s.city, 'country', s.country, 'phone', s.phone, 'email', s.email,
           'fiscal_responsibilities', to_jsonb(s.fiscal_responsibilities)
         )
    from public.suppliers s
   where s.id = p_supplier_id;
$function$;

-- Disparadores de expedición.
create or replace function public.fn_document_snapshot_factura()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tipo text := case coalesce(new.document_type, 'invoice')
    when 'invoice' then 'factura_venta' when 'credit_note' then 'nota_credito' when 'debit_note' then 'nota_debito' else null end;
begin
  if v_tipo is not null and new.status is distinct from 'draft' then
    perform public.fn_document_snapshot_guardar(
      new.organization_id, v_tipo, new.id, public.fn_document_snapshot_dia(new.organization_id, coalesce(new.issue_date, new.created_at)),
      case when new.customer_id is null then null else public.fn_document_snapshot_cliente(new.customer_id) end
    );
  end if;
  return null;
end;
$function$;

create or replace function public.fn_document_snapshot_soporte()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.status is distinct from 'draft' and new.status is distinct from 'cancelled' then
    perform public.fn_document_snapshot_guardar(
      new.organization_id, 'documento_soporte', new.id,
      public.fn_document_snapshot_dia(new.organization_id, coalesce(new.issue_date, new.created_at)),
      case when new.supplier_id is null then null else public.fn_document_snapshot_proveedor(new.supplier_id) end
    );
  end if;
  return null;
end;
$function$;

create or replace function public.fn_document_snapshot_cotizacion()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.status is distinct from 'draft' then
    perform public.fn_document_snapshot_guardar(
      new.organization_id, 'cotizacion', new.id, coalesce(new.issue_date, public.fn_document_snapshot_dia(new.organization_id, new.created_at)),
      case when new.customer_id is null then null else public.fn_document_snapshot_cliente(new.customer_id) end
    );
  end if;
  return null;
end;
$function$;

create or replace function public.fn_document_snapshot_pago()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if new.status = 'completed' then
    perform public.fn_document_snapshot_guardar(
      new.organization_id, 'recibo_pago', new.id,
      public.fn_document_snapshot_dia(new.organization_id, coalesce(new.payment_date, new.created_at)), null
    );
  end if;
  return null;
end;
$function$;

-- Envío aceptado: el receptor tal como viajó en el documento electrónico.
create or replace function public.fn_document_snapshot_envio_aceptado()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tipo text := case new.document_type
    when 'invoice' then 'factura_venta' when 'credit_note' then 'nota_credito' when 'debit_note' then 'nota_debito'
    when 'support_document' then 'documento_soporte' else null end;
  v_receptor jsonb := coalesce(new.request_payload -> 'customer', new.request_payload -> 'provider');
begin
  if new.status = 'accepted' and old.status is distinct from 'accepted' and v_tipo is not null
     and jsonb_typeof(v_receptor) = 'object' then
    update public.document_party_snapshots
       set receptor_xml = v_receptor, receptor_xml_en = now()
     where documento_tipo = v_tipo
       and documento_id = coalesce(new.invoice_id, new.support_document_id)
       and organization_id = new.organization_id
       and receptor_xml is null;
  end if;
  return null;
end;
$function$;

drop trigger if exists trg_zz_instantanea_partes on public.invoice_sales;
create trigger trg_zz_instantanea_partes
  after insert or update of status on public.invoice_sales
  for each row execute function public.fn_document_snapshot_factura();

drop trigger if exists trg_zz_instantanea_partes on public.support_documents;
create trigger trg_zz_instantanea_partes
  after insert or update of status on public.support_documents
  for each row execute function public.fn_document_snapshot_soporte();

drop trigger if exists trg_zz_instantanea_partes on public.quotations;
create trigger trg_zz_instantanea_partes
  after insert or update of status on public.quotations
  for each row execute function public.fn_document_snapshot_cotizacion();

drop trigger if exists trg_zz_instantanea_partes on public.payments;
create trigger trg_zz_instantanea_partes
  after insert or update of status on public.payments
  for each row execute function public.fn_document_snapshot_pago();

drop trigger if exists trg_zz_instantanea_receptor_xml on public.electronic_invoicing_jobs;
create trigger trg_zz_instantanea_receptor_xml
  after update of status on public.electronic_invoicing_jobs
  for each row execute function public.fn_document_snapshot_envio_aceptado();

-- Ninguna de estas funciones se llama desde la aplicación: cerradas a todos los roles de cliente.
revoke all on function public.fn_document_party_snapshots_inmutable() from public, anon, authenticated;
revoke all on function public.fn_document_snapshot_emisor(integer, date) from public, anon, authenticated;
revoke all on function public.fn_document_snapshot_dia(integer, timestamptz) from public, anon, authenticated;
revoke all on function public.fn_document_snapshot_guardar(integer, text, uuid, date, jsonb) from public, anon, authenticated;
revoke all on function public.fn_document_snapshot_cliente(uuid) from public, anon, authenticated;
revoke all on function public.fn_document_snapshot_proveedor(integer) from public, anon, authenticated;
revoke all on function public.fn_document_snapshot_factura() from public, anon, authenticated;
revoke all on function public.fn_document_snapshot_soporte() from public, anon, authenticated;
revoke all on function public.fn_document_snapshot_cotizacion() from public, anon, authenticated;
revoke all on function public.fn_document_snapshot_pago() from public, anon, authenticated;
revoke all on function public.fn_document_snapshot_envio_aceptado() from public, anon, authenticated;
