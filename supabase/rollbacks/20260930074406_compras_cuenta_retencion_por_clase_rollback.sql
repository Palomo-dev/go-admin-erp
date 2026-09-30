-- Rollback de 20260930074406_compras_cuenta_retencion_por_clase.
--
-- Restaura fn_cuenta_retencion_compra a la versión de 20260930073908 (palabra
-- IVA antes que ICA). No toca datos: los asientos ya publicados conservan la
-- cuenta con que se crearon.

create or replace function public.fn_cuenta_retencion_compra(p_organization_id integer, p_tax_code text, p_concept text)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_cuenta text;
  v_codigo text := upper(coalesce(btrim(p_tax_code), ''));
  v_concepto text := upper(coalesce(btrim(p_concept), ''));
  v_iva constant text := '(^|[^A-Z])(RETE)?IVA([^A-Z]|$)|RETEIVA';
  v_ica constant text := '(^|[^A-Z])(RETE)?ICA([^A-Z]|$)|RETEICA|INDUSTRIA Y COMERCIO';
begin
  if v_codigo <> '' then
    select m.account_code into v_cuenta
    from tax_account_mapping m
    left join tax_templates tt on tt.id = m.tax_template_id
    left join organization_taxes ot on ot.id = m.organization_tax_id and ot.organization_id = p_organization_id
    left join tax_templates tt2 on tt2.id = ot.template_id
    where m.organization_id = p_organization_id
      and m.is_active
      and v_codigo in (upper(tt.code), upper(tt2.code))
      and exists (select 1 from chart_of_accounts c
                  where c.organization_id = p_organization_id and c.account_code = m.account_code)
    order by (m.organization_tax_id is not null) desc
    limit 1;

    if v_cuenta is not null then
      return v_cuenta;
    end if;
  end if;

  -- El código manda sobre el concepto: «ReteICA sobre base sin IVA» es ICA.
  if v_codigo ~ v_iva then return '2367'; end if;
  if v_codigo ~ v_ica then return '2368'; end if;
  if v_concepto ~ v_iva then return '2367'; end if;
  if v_concepto ~ v_ica then return '2368'; end if;
  return '2365';
end;
$$;

revoke all on function public.fn_cuenta_retencion_compra(integer, text, text) from public, anon, authenticated;
grant execute on function public.fn_cuenta_retencion_compra(integer, text, text) to service_role;
