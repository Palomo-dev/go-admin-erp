-- Impuestos iniciales · el país sale de la organización, no de un 'CO' cableado (2026-09-28).
--
-- Hallazgos verificados por MCP (docs/hallazgos/comisiones-e-impuestos-2026-09-28.md, B8):
--   - initialize_organization_taxes filtraba tax_templates.country = 'CO', pero
--     el catálogo usa ISO alfa-3: 'COL' (y 'AUS', 'BRA', 'CAN', 'CHL', 'ESP',
--     'GBR', 'JPN', 'MEX', 'USA'). No copiaba NINGÚN impuesto.
--   - organizations.country_code también es alfa-3: 77 organizaciones 'COL' y 12
--     NULL. Ninguna con 'CO'.
--   - Solo exigía pertenencia (fn_assert_acceso_org): cualquier miembro podía
--     escribir organization_taxes por aquí, saltándose la guarda de gestión que
--     20260928200000 puso a crear/editar/eliminar impuestos.
--   - Sin idempotencia: una segunda llamada duplicaba impuestos y, con el índice
--     único parcial uq_organization_taxes_un_por_defecto, fallaba al marcar
--     IVA_19 por defecto si ya había uno.
--
-- Daño medido: 0 organizaciones sin impuestos POR ESTA FUNCIÓN. No tiene ningún
-- llamador (ni en este repositorio ni en go-admin-super / go-admin-sellers /
-- goadmin-websites, ni desde otra función o disparador): el alta de una
-- organización siembra con setup_organization_defaults(org, 'COL'), que filtra
-- por el país recibido. Hay 13 organizaciones sin ningún impuesto (12 con
-- country_code NULL y 1 'COL', todas creadas en 2025, 0 líneas facturadas):
-- nunca pasaron por setup_organization_defaults. No se les crea nada aquí.
--
-- Qué hace:
--   1. País: organizations.country_code de la organización; sin país, 'COL'
--      (el catálogo inicial de la función era el colombiano).
--   2. Exige gestión de impuestos (fn_impuestos_exigir_gestion: admin o
--      finance.create / finance.approve), como el resto de escrituras.
--   3. Idempotente: no copia una plantilla que la organización ya tiene y solo
--      marca IVA_19 por defecto si la organización no tiene ya uno.
--   4. Devuelve void, como antes (misma firma; sin llamadores que romper).

create or replace function public.initialize_organization_taxes(org_id integer)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_pais text;
  v_hay_por_defecto boolean;
begin
  perform public.fn_impuestos_exigir_gestion(org_id);

  select coalesce(nullif(btrim(o.country_code), ''), 'COL') into v_pais
    from public.organizations o where o.id = org_id;
  if not found then
    raise exception 'organizacion_no_encontrada' using errcode = 'P0002';
  end if;

  select exists (select 1 from public.organization_taxes t
                  where t.organization_id = org_id and t.is_default)
    into v_hay_por_defecto;

  insert into public.organization_taxes (
    organization_id, template_id, name, rate, description, is_default, is_active
  )
  select org_id, tt.id, tt.name, tt.rate, tt.description,
         (not v_hay_por_defecto and tt.code = 'IVA_19'),
         true
    from public.tax_templates tt
   where tt.country = v_pais
     and (tt.valid_to is null or tt.valid_to > now())
     and not exists (select 1 from public.organization_taxes t
                      where t.organization_id = org_id and t.template_id = tt.id);
end;
$function$;

revoke all on function public.initialize_organization_taxes(integer) from public, anon;
grant execute on function public.initialize_organization_taxes(integer) to authenticated, service_role;

comment on function public.initialize_organization_taxes(integer) is
  'Copia a la organización las plantillas de impuestos de su país (organizations.country_code, alfa-3; sin país, COL). Exige gestión de impuestos. Idempotente.';
