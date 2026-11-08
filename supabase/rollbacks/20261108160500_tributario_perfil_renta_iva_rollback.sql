-- Reversión de supabase/migrations/20261108160500_tributario_perfil_renta_iva.sql.
-- Revertir ANTES que 20261108160000_tributario_catalogo_rut_y_codigos_fe.
--
-- ADVERTENCIA DE DATOS: quita las columnas nuevas del perfil. Lo que se haya guardado en ellas (régimen de renta,
-- condición de IVA, booleanos, códigos del RUT, motivo, advertencias aceptadas) se PIERDE. El campo combinado viejo
-- `regimen` se conserva, pero en vigencias guardadas con la v2 puede estar NULL (no contribuyente): esas filas se
-- llenan aquí con 'ordinario' / 'no_responsable_iva' para poder devolverle el NOT NULL, lo que NO restaura su
-- significado (el campo viejo no puede expresarlo). Revisar esas vigencias después de revertir.

drop function if exists public.fn_perfil_tributario_guardar_v2(integer, uuid, date, text, text, text, boolean, boolean, boolean, boolean, boolean, text[], text[], text, text[], jsonb, text);
drop function if exists public.fn_perfil_tributario_bloqueos(text, text, text, boolean, boolean, boolean, boolean, boolean, text[], text[]);

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
  drop column if exists autorretenedor,
  drop column if exists agente_retencion_iva,
  drop column if exists responsabilidades_rut,
  drop column if exists motivo_cambio_periodicidad,
  drop column if exists advertencias_aceptadas,
  drop column if exists requiere_revision,
  drop column if exists regimen_origen;
