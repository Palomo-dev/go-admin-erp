-- Reversión de supabase/migrations/20261108160000_tributario_catalogo_rut_y_codigos_fe.sql.
-- Revertir ANTES 20261108160500_tributario_perfil_renta_iva (su función valida contra rut_responsabilidades).
-- Borra el catálogo del RUT y el mapeo (datos de referencia que la propia migración cargó) y quita las columnas de
-- validación agregadas a dian_fiscal_responsibilities. Los códigos y descripciones de esa tabla no se tocaron: no hay
-- nada que restaurar en ellos. Si el Contador ya había marcado filas como «validado», esa marca se pierde.

drop table if exists public.rut_fe_responsabilidad_mapeo;
drop table if exists public.rut_responsabilidades;

alter table public.dian_fiscal_responsibilities
  drop column if exists estado_validacion,
  drop column if exists nombre_anexo,
  drop column if exists fuente,
  drop column if exists nota;

comment on table public.dian_fiscal_responsibilities is null;
