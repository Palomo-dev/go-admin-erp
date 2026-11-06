create or replace function public.fn_tercero_de_documento(
  p_tipo text,
  p_id uuid,
  out nit text,
  out nombre text
) returns record
language plpgsql
stable
set search_path to public, pg_temp
as $fn$
declare
  v_org integer;
begin
  nit := null;
  nombre := null;
  if p_tipo in ('venta', 'nota_debito', 'nota_credito') then
    select coalesce(nullif(btrim(c.identification_number), ''), nullif(btrim(c.doc_number), '')),
           nullif(btrim(c.full_name), ''),
           i.organization_id
      into nit, nombre, v_org
      from public.invoice_sales i
      left join public.customers c
        on c.id = i.customer_id
       and c.organization_id = i.organization_id
     where i.id = p_id;

    -- El devengo del POS usa el id de la venta, que no es el id de la factura.
    if not found and p_tipo = 'venta' then
      select coalesce(nullif(btrim(c.identification_number), ''), nullif(btrim(c.doc_number), '')),
             nullif(btrim(c.full_name), ''),
             s.organization_id
        into nit, nombre, v_org
        from public.sales s
        left join public.customers c
          on c.id = s.customer_id
         and c.organization_id = s.organization_id
       where s.id = p_id;
    end if;

    if nit is null then
      select t.nit, t.nombre
        into nit, nombre
        from public.fn_consumidor_final_contable(v_org) t;
    end if;
  elsif p_tipo = 'compra' then
    select coalesce(nullif(btrim(s.nit), ''), nullif(btrim(s.tax_id), '')),
           nullif(btrim(s.name), ''),
           i.organization_id
      into nit, nombre, v_org
      from public.invoice_purchase i
      left join public.suppliers s on s.id = i.supplier_id
     where i.id = p_id;
    -- nombre es parámetro de salida: hay que calificarlo para no
    -- chocar con la columna del tercero por defecto.
    if nit is null and v_org is not null then
      select t.nit, coalesce(fn_tercero_de_documento.nombre, t.nombre)
        into nit, nombre
        from public.fn_consumidor_final_contable(v_org) t;
    end if;
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
grant execute on function public.fn_tercero_de_documento(text, uuid) to service_role;
