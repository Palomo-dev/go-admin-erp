-- Precisión de las tarifas de impuestos y retenciones (Contador, ronda 2 · ReteICA).
--
-- ESCRITA, NO APLICADA. Se aplica por el MCP (apply_migration) cuando el dueño lo ordene, después de
-- 20261108160500 y antes de 20261108170000 (que la usa). Reversión:
-- supabase/rollbacks/20261108165000_tarifas_precision_exacta_rollback.sql
--
-- Problema (verificado por el MCP el 2026-11-07): organization_taxes.rate y tax_templates.rate son numeric(5,2).
-- La plantilla «ICA_0.966» (9,66 por mil = 0,966 %) quedó guardada como 0,97 % en la plantilla y en las 35
-- organizaciones: sobre $1.000.000 la retención da $9.700 en vez de $9.660.
--
-- Aditiva (regla del repositorio: sin cambios de tipo en tablas con datos de clientes): una columna nueva
-- `tarifa_exacta numeric(12,6)` en las dos tablas, NULL-able, y una función de lectura que la prefiere. La columna
-- `rate` no se toca (la siguen leyendo la UI y los cálculos actuales; pasarlos a la función es un cambio aparte).
-- Relleno solo inequívoco: una plantilla cuyo código termina en la tarifa con más decimales (p. ej. ICA_0.966) y
-- cuyo `rate` es ese número redondeado a dos decimales; una retención de la organización hereda la de su plantilla
-- solo si su `rate` coincide con el de la plantilla (si la organización la cambió, no se adivina).

alter table public.tax_templates add column if not exists tarifa_exacta numeric(12,6);
alter table public.organization_taxes add column if not exists tarifa_exacta numeric(12,6);

comment on column public.tax_templates.tarifa_exacta is
  'Tarifa en porcentaje con la precisión necesaria (0,966 = 9,66 por mil). NULL = vale rate. Leer con fn_tarifa_exacta_impuesto.';
comment on column public.organization_taxes.tarifa_exacta is
  'Tarifa en porcentaje con la precisión necesaria (0,966 = 9,66 por mil). NULL = vale rate. Leer con fn_tarifa_exacta_impuesto.';

update public.tax_templates t
   set tarifa_exacta = substring(t.code from '_([0-9]+\.[0-9]+)$')::numeric
 where t.tarifa_exacta is null
   and t.code ~ '_[0-9]+\.[0-9]{3,6}$'
   and round(substring(t.code from '_([0-9]+\.[0-9]+)$')::numeric, 2) = t.rate;

update public.organization_taxes ot
   set tarifa_exacta = tt.tarifa_exacta
  from public.tax_templates tt
 where tt.id = ot.template_id
   and ot.tarifa_exacta is null
   and tt.tarifa_exacta is not null
   and ot.rate = tt.rate;

-- Tarifa en porcentaje de un impuesto o retención de la organización: la exacta si existe; si no, rate.
create or replace function public.fn_tarifa_exacta_impuesto(p_organization_tax uuid)
 returns numeric
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select coalesce(ot.tarifa_exacta, ot.rate) from public.organization_taxes ot where ot.id = p_organization_tax;
$function$;

revoke all on function public.fn_tarifa_exacta_impuesto(uuid) from public, anon;
grant execute on function public.fn_tarifa_exacta_impuesto(uuid) to authenticated;
