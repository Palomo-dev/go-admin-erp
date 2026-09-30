-- Cuenta de cada retención: marcadores inequívocos antes que palabras sueltas.
--
-- En 20260930073908, sin código de retención, un concepto como «ReteICA sobre
-- base sin IVA» caía en 2367 porque la palabra IVA se evaluaba primero. Ahora,
-- para el código y después para el concepto, en este orden:
--   1. ReteICA / «industria y comercio»          → 2368
--   2. ReteIVA / «impuesto a las ventas»         → 2367
--   3. ReteFuente / «en la fuente» / RETE_<n>    → 2365
--   4. la palabra ICA                            → 2368
--   5. la palabra IVA                            → 2367
-- Si nada coincide, 2365. El mapeo de tax_account_mapping sigue mandando.

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
  v_texto text;
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

  foreach v_texto in array array[v_codigo, upper(coalesce(btrim(p_concept), ''))] loop
    continue when v_texto = '';
    if v_texto ~ 'RETE[ _-]?ICA|INDUSTRIA Y COMERCIO' then return '2368'; end if;
    if v_texto ~ 'RETE[ _-]?IVA|IMPUESTO A LAS VENTAS' then return '2367'; end if;
    if v_texto ~ 'RETE[ _-]?FUENTE|EN LA FUENTE|(^|[^A-Z])RETE_[0-9]' then return '2365'; end if;
    if v_texto ~ '(^|[^A-Z])ICA([^A-Z]|$)' then return '2368'; end if;
    if v_texto ~ '(^|[^A-Z])IVA([^A-Z]|$)' then return '2367'; end if;
  end loop;
  return '2365';
end;
$$;

revoke all on function public.fn_cuenta_retencion_compra(integer, text, text) from public, anon, authenticated;
grant execute on function public.fn_cuenta_retencion_compra(integer, text, text) to service_role;
