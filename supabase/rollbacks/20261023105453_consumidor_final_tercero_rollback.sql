-- Revierte el devengo a consumidor final.
--
-- Los asientos y los terceros que escribió el reintento no vuelven solos al
-- borrar las funciones. Este archivo sí los deshace, con la llave de
-- mantenimiento que ya usa la contabilidad para tocar un asiento publicado.
-- El consecutivo del comprobante de las notas crédito creadas no se devuelve:
-- el siguiente número queda con el salto.
-- Si después alguien cambió el NIT de una línea, esa línea no se toca: solo se
-- limpia el NIT que sigue siendo el consumidor final de la organización.

select set_config('app.contabilidad_mantenimiento', 'on', true);

delete from public.journal_lines jl
 using public.journal_entries e
 join public.journal_entry_failures f
   on f.resolved_entry_id = e.id
  and f.organization_id = e.organization_id
  and f.resolution = 'Reintento de tercero requerido: asiento creado con la clave del hecho.'
 where jl.journal_entry_id = e.id;

delete from public.journal_entries e
 using public.journal_entry_failures f
 where f.resolved_entry_id = e.id
   and f.organization_id = e.organization_id
   and f.resolution = 'Reintento de tercero requerido: asiento creado con la clave del hecho.';

update public.journal_lines jl
   set tercero_nit = null,
       tercero_nombre = case
         when jl.tercero_nombre = coalesce(nullif(btrim(c.nombre), ''), 'Consumidor final') then null
         else jl.tercero_nombre
       end
  from public.journal_entries e
  join public.journal_entry_failures f
    on f.resolved_entry_id = e.id
   and f.organization_id = e.organization_id
   and f.resolution = 'La clave del hecho ya tenía asiento; se completó el tercero faltante y no se duplicó.'
  left join public.contabilidad_consumidor_final c
    on c.organization_id = e.organization_id
 where jl.journal_entry_id = e.id
   and jl.tercero_nit = coalesce(nullif(btrim(c.nit), ''), '222222222222');

update public.journal_entry_failures
   set resolved_at = null,
       resolved_entry_id = null,
       resolution = null
 where resolution in (
   'Reintento de tercero requerido: asiento creado con la clave del hecho.',
   'La clave del hecho ya tenía asiento; se completó el tercero faltante y no se duplicó.',
   'La clave del hecho ya tenía asiento; no se duplicó.'
 );

select set_config('app.contabilidad_mantenimiento', '', true);

drop function if exists public.fn_reintentar_asientos_tercero_requerido();

create or replace function public.fn_tercero_de_documento(
  p_tipo text,
  p_id uuid,
  out nit text,
  out nombre text
) returns record
language plpgsql
stable
set search_path to 'public', 'pg_temp'
as $fn$
begin
  nit := null;
  nombre := null;
  if p_tipo in ('venta', 'nota_debito', 'nota_credito') then
    select coalesce(nullif(btrim(c.identification_number), ''), nullif(btrim(c.doc_number), '')),
           nullif(btrim(c.full_name), '')
      into nit, nombre
      from public.invoice_sales i
      left join public.customers c on c.id = i.customer_id
     where i.id = p_id;
  elsif p_tipo = 'compra' then
    select coalesce(nullif(btrim(s.nit), ''), nullif(btrim(s.tax_id), '')),
           nullif(btrim(s.name), '')
      into nit, nombre
      from public.invoice_purchase i
      left join public.suppliers s on s.id = i.supplier_id
     where i.id = p_id;
  elsif p_tipo = 'documento_soporte' then
    select coalesce(nullif(btrim(s.nit), ''), nullif(btrim(s.tax_id), ''), nullif(btrim(d.provider->>'identification'), '')),
           coalesce(nullif(btrim(s.name), ''), nullif(btrim(d.provider->>'names'), ''))
      into nit, nombre
      from public.support_documents d
      left join public.suppliers s on s.id = d.supplier_id
     where d.id = p_id;
  end if;
end;
$fn$;

revoke all on function public.fn_tercero_de_documento(text, uuid) from public, anon, authenticated;

create or replace function public.fn_trg_tercero_linea_asiento()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $fn$
declare
  v_source text;
  v_source_id text;
  v_org integer;
  v_nit text;
  v_nombre text;
begin
  if new.tercero_nit is not null then
    return new;
  end if;
  select e.source, e.source_id, e.organization_id
    into v_source, v_source_id, v_org
    from public.journal_entries e
   where e.id = new.journal_entry_id;
  if v_source is null or v_source not in ('invoice_sales', 'invoice_purchase', 'credit_note', 'cash_movements', 'support_documents') then
    return new;
  end if;

  if v_source = 'cash_movements' then
    select nullif(btrim(cm.tercero_nit), ''), nullif(btrim(cm.tercero_nombre), '')
      into v_nit, v_nombre
      from public.cash_movements cm
     where cm.id::text = v_source_id and cm.organization_id = v_org;
  elsif v_source = 'invoice_purchase' then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('compra', v_source_id::uuid) t;
  elsif v_source = 'support_documents' then
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('documento_soporte', v_source_id::uuid) t;
  else
    select t.nit, t.nombre into v_nit, v_nombre
      from public.fn_tercero_de_documento('venta', v_source_id::uuid) t;
  end if;

  if v_nit is not null then
    new.tercero_nit := v_nit;
    new.tercero_nombre := coalesce(new.tercero_nombre, v_nombre);
  end if;
  return new;
exception when others then
  return new;
end;
$fn$;

revoke all on function public.fn_trg_tercero_linea_asiento() from public, anon, authenticated;

drop function if exists public.fn_consumidor_final_contable(integer);
drop table if exists public.contabilidad_consumidor_final;
