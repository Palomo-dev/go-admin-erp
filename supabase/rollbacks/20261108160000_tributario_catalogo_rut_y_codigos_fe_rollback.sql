-- Reversión de supabase/migrations/20261108160000_tributario_catalogo_rut_y_codigos_fe.sql.
-- Revertir ANTES 20261108160500_tributario_perfil_renta_iva (su función valida contra rut_responsabilidades).
-- Borra el catálogo del RUT y el mapeo (datos de referencia que la propia migración cargó) y quita las columnas de
-- validación agregadas a dian_fiscal_responsibilities. Ronda 4: la migración cambió la descripción de R-99-PN a
-- «No aplica – Otros»; aquí vuelve a la que tenía («No responsable (persona natural)»). Ningún otro código ni descripción
-- se tocó. Si el Contador ya había marcado filas como «validado», esa marca se pierde.

update public.dian_fiscal_responsibilities
   set description = 'No responsable (persona natural)'
 where code = 'R-99-PN' and description = 'No aplica – Otros';

drop table if exists public.rut_fe_responsabilidad_mapeo;
drop table if exists public.rut_responsabilidades;

alter table public.dian_fiscal_responsibilities
  drop column if exists estado_validacion,
  drop column if exists nombre_anexo,
  drop column if exists fuente,
  drop column if exists nota;

comment on table public.dian_fiscal_responsibilities is null;
