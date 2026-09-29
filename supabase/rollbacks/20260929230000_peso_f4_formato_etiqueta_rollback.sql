-- Reversión de 20260929230000_peso_f4_formato_etiqueta: quita el formato de
-- etiqueta de peso variable de organization_barcode_settings. Revertir antes
-- 20260929230400 … 20260929230100 (usan estas columnas).

alter table public.organization_barcode_settings drop constraint if exists obs_weight_label_check;

alter table public.organization_barcode_settings
  drop column if exists weight_label_value_check,
  drop column if exists weight_label_value_digits,
  drop column if exists weight_label_plu_digits,
  drop column if exists weight_label_content,
  drop column if exists weight_label_prefixes,
  drop column if exists weight_label_enabled;
