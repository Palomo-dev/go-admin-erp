-- Rollback de 20260930085700_compras_retenciones_configuracion.
--
-- Restaura fn_cuenta_retencion_compra a la versión de 20260930074406 y retira
-- las funciones, la columna y la tabla nuevas.
--
-- ADVERTENCIA — datos:
-- * Se pierde organization_taxes.min_base_uvt (las bases mínimas que cada
--   organización haya fijado).
-- * Las filas de tax_account_mapping creadas por fn_retencion_configurar
--   (account_type = 'withholding_payable') se conservan: la función restaurada
--   las sigue leyendo cuando la retención tiene plantilla; las de retenciones
--   sin plantilla dejan de aplicarse (se reconocían por el nombre).
-- * NO se devuelven a anon ni a authenticated los permisos de escritura sobre
--   tax_account_mapping: era un hueco de seguridad (cualquier miembro, y anon
--   por grant, podía cambiar a qué cuenta va una retención), no un
--   comportamiento que haya que restaurar.

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

drop function if exists public.fn_retenciones_cargar_plantilla(integer);
drop function if exists public.fn_retencion_configurar(integer, uuid, text, numeric);
drop function if exists public.fn_retenciones_configuracion(integer);
drop function if exists public.fn_clase_retencion(text, text);

alter table public.organization_taxes drop constraint if exists organization_taxes_min_base_uvt_check;
alter table public.organization_taxes drop column if exists min_base_uvt;

drop table if exists public.fiscal_uvt;
