-- Impuesto al consumo 8 % (INC) para todas las organizaciones de Colombia (2026-10-05).
--
-- Pedido del dueño: «para todas las organizaciones actuales y futuras en
-- Colombia».
--   - Futuras: setup_organization_defaults copia TODAS las plantillas vigentes
--     del país, así que la plantilla INC_8 (20261005143459) ya entra sola.
--   - Actuales: aquí. Verificado por MCP: 91 organizaciones con
--     country_code = 'COL' (ninguna sin país ni de otro país); ninguna tenía un
--     impuesto al 8 %.
--
-- Qué hace: una fila en organization_taxes por organización de Colombia que no
-- tenga ya la plantilla INC_8. Activo, NO por defecto y tax_included = false,
-- igual que los demás impuestos sembrados: no se asigna a ningún producto, así
-- que no cambia ningún precio ni ninguna factura hasta que la organización lo
-- use. La clase (kind) la pone el disparador desde la plantilla. Idempotente.
insert into public.organization_taxes (organization_id, template_id, name, rate, description, is_active, is_default)
select o.id, tt.id, tt.name, tt.rate, tt.description, true, false
  from public.organizations o
  join public.tax_templates tt on tt.code = 'INC_8' and tt.country = o.country_code
 where o.country_code = 'COL'
   and not exists (select 1 from public.organization_taxes ot
                    where ot.organization_id = o.id and ot.template_id = tt.id);
