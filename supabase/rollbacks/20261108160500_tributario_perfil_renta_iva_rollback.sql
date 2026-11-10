-- Reversión de supabase/migrations/20261108160500_tributario_perfil_renta_iva.sql.
-- Revertir DESPUÉS de 20261108161000 (decisiones) y ANTES que 20261108160000 (catálogo).
--
-- ADVERTENCIA DE DATOS: quita las columnas nuevas del perfil. Lo guardado en ellas (régimen de renta, condición de IVA,
-- calidades y sus actos, INC, RTE, no contribuyentes, códigos del RUT, cambio de periodicidad, advertencias aceptadas;
-- ronda 4: calificación del gran contribuyente, procedencia del cambio y aclaraciones; ronda 5: donaciones y
-- cooperación internacional del 2532 con su constancia) se PIERDE. El campo combinado viejo `regimen` se conserva; donde quedó NULL (no contribuyentes) se llena con
-- 'ordinario' / 'no_responsable_iva' para devolverle el NOT NULL, lo que NO restaura su significado.

drop function if exists public.fn_perfil_tributario_evaluar_cambio(integer, uuid, text, text);
drop function if exists public.fn_perfil_tributario_guardar_v2(integer, uuid, date, jsonb, jsonb, text);
drop function if exists public.fn_perfil_tributario_aclaraciones(jsonb);
drop function if exists public.fn_perfil_tributario_bloqueos(jsonb);

grant execute on function public.fn_perfil_tributario_guardar(integer, uuid, date, text, text[], boolean, boolean, text, jsonb, text) to authenticated;

update public.organization_tax_profiles
   set regimen = case when condicion_iva = 'no_responsable' then 'no_responsable_iva' else 'ordinario' end
 where regimen is null;
alter table public.organization_tax_profiles alter column regimen set not null;
comment on column public.organization_tax_profiles.regimen is null;
comment on column public.organization_tax_profiles.responsabilidades is null;

alter table public.organization_tax_profiles
  drop column if exists regimen_renta,
  drop column if exists condicion_iva,
  drop column if exists gran_contribuyente,
  drop column if exists gran_contribuyente_acto,
  drop column if exists gran_contribuyente_desde,
  drop column if exists autorretenedor,
  drop column if exists autorretenedor_acto,
  drop column if exists autorretenedor_acto_fecha,
  drop column if exists autorretencion_especial,
  drop column if exists agente_retencion_iva,
  drop column if exists inc_actividad,
  drop column if exists rte_tipo,
  drop column if exists rte_ingresos_superan_160000_uvt,
  drop column if exists no_contribuyente_naturaleza,
  drop column if exists responsabilidades_rut,
  drop column if exists motivo_cambio_periodicidad,
  drop column if exists cambio_periodicidad_hecho,
  drop column if exists cambio_periodicidad_norma,
  drop column if exists cambio_periodicidad_fecha,
  drop column if exists cambio_periodicidad_estado,
  drop column if exists advertencias_aceptadas,
  drop column if exists requiere_revision,
  drop column if exists regimen_origen,
  drop column if exists gran_contribuyente_calificacion,
  drop column if exists gran_contribuyente_acto_fecha,
  drop column if exists cambio_periodicidad_procedencia,
  drop column if exists cambio_periodicidad_evaluacion,
  drop column if exists cambio_periodicidad_evaluado_por,
  drop column if exists cambio_periodicidad_evaluado_en,
  drop column if exists aclaraciones,
  -- Ronda 5: formato 2532 de las cooperativas.
  drop column if exists rte_donaciones_cooperacion,
  drop column if exists rte_donaciones_constancia;
