-- Reclasificación opcional (no se ejecuta) y backfills de seriales, garantía y configuración.

create or replace function public.fn_reclasificar_iva_generado(p_org integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_neto numeric;
  v_branch integer;
  v_existente integer;
  v_id integer;
begin
  perform public.fn_finanzas_exigir_permiso(p_org, array['finance.create', 'accounting.reverse']);
  select je.id into v_existente
    from public.journal_entries je
   where je.organization_id = p_org
     and je.fact_key = 'reclasificacion:iva_generado:' || p_org::text
   limit 1;
  if v_existente is not null then
    return jsonb_build_object('repetida', true, 'journal_entry_id', v_existente, 'monto', 0);
  end if;

  select coalesce(sum(jl.credit - jl.debit), 0) into v_neto
    from public.journal_lines jl
    join public.journal_entries je on je.id = jl.journal_entry_id
   where je.organization_id = p_org
     and coalesce(je.posted, false)
     and jl.account_code = '2405'
     and jl.description like 'IVA - %'
     and coalesce(je.fact_key, '') not like 'reclasificacion:iva_generado:%';
  if v_neto <= 0.01 then
    return jsonb_build_object('repetida', false, 'journal_entry_id', null, 'monto', 0);
  end if;

  select b.id into v_branch
    from public.branches b
   where b.organization_id = p_org and b.is_main and b.is_active
   order by b.id
   limit 1;
  if v_branch is null then
    select min(b.id) into v_branch from public.branches b where b.organization_id = p_org;
  end if;

  v_id := public.fn_create_journal_entry(
    p_organization_id := p_org,
    p_branch_id := v_branch,
    p_entry_date := now(),
    p_memo := 'Reclasificación de IVA generado de 2405 a 2408',
    p_source := 'manual',
    p_source_id := 'iva-generado',
    p_debit_account := '2405',
    p_credit_account := '2408',
    p_amount := round(v_neto, 2),
    p_tax_account := null,
    p_tax_amount := 0,
    p_created_by := auth.uid(),
    p_tax_is_credit := false,
    p_fact_key := 'reclasificacion:iva_generado:' || p_org::text
  );
  if v_id is null then
    raise exception 'cuenta_no_configurada' using errcode = '22023',
      detail = 'No se pudo publicar el traslado de 2405 a 2408. Revise que ambas cuentas existan y sean de movimiento.';
  end if;
  return jsonb_build_object('repetida', false, 'journal_entry_id', v_id, 'monto', round(v_neto, 2));
end;
$function$;

comment on function public.fn_reclasificar_iva_generado(integer) is
  'Asiento nuevo, idempotente, que traslada el IVA generado histórico de 2405 a 2408 (débito 2405, crédito 2408). No modifica líneas de asientos ya publicados. No se ejecuta sola: la dispara Finanzas.';

revoke all on function public.fn_reclasificar_iva_generado(integer) from public, anon;
grant execute on function public.fn_reclasificar_iva_generado(integer) to authenticated, service_role;

update public.sale_items si
   set serial_ids = g.ids
  from (
    select si2.id, array_agg(sn.id order by sn.id) as ids
      from public.sale_items si2
      join public.sales s on s.id = si2.sale_id
      join public.serial_numbers sn
        on sn.organization_id = s.organization_id
       and sn.sale_id = s.id::text
       and sn.product_id = si2.product_id
       and sn.status = 'sold'
     where cardinality(coalesce(si2.serial_ids, '{}')) = 0
       and (
         select count(*) from public.sale_items x
          where x.sale_id = si2.sale_id and x.product_id = si2.product_id
       ) = 1
     group by si2.id, si2.quantity
    having count(*) <= ceil(si2.quantity)
  ) g
 where si.id = g.id
   and cardinality(coalesce(si.serial_ids, '{}')) = 0;

update public.serial_numbers sn
   set warranty_months = p.warranty_months
  from public.products p
 where p.id = sn.product_id
   and p.organization_id = sn.organization_id
   and sn.warranty_months is null
   and coalesce(p.warranty_months, 0) > 0
   and sn.status not in ('in_stock', 'reserved', 'in_transit');

update public.serial_numbers sn
   set warranty_start = public.fn_dia_zona(sn.sale_date, z.tz),
       warranty_end = (public.fn_dia_zona(sn.sale_date, z.tz) + make_interval(months => sn.warranty_months))::date
  from (
    select sn2.id,
           coalesce(
             nullif(btrim(b.timezone), ''),
             nullif(btrim(o.timezone), ''),
             'America/Bogota'
           ) as tz
      from public.serial_numbers sn2
      join public.organizations o on o.id = sn2.organization_id
      left join public.branches b
        on b.id = coalesce(sn2.current_branch_id, sn2.branch_id)
       and b.organization_id = o.id
  ) z
 where sn.id = z.id
   and sn.warranty_start is null
   and sn.warranty_end is null
   and coalesce(sn.warranty_months, 0) > 0
   and sn.sale_date is not null
   and sn.status not in ('in_stock', 'reserved', 'in_transit');

insert into public.configuracion_contable (organization_id, branch_id, clave, account_code)
select o.id, null, p.clave, p.account_code
  from public.organizations o
  cross join lateral public.fn_propuesta_configuracion_sector(o.type_id) p
  join public.chart_of_accounts c
    on c.organization_id = o.id
   and c.account_code = p.account_code
   and c.es_movimiento is distinct from false
 where not exists (
   select 1 from public.configuracion_contable cc where cc.organization_id = o.id
 )
on conflict on constraint configuracion_contable_unica do nothing;
