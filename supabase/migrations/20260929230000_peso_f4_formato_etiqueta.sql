-- Productos por peso, fase 4: formato de las etiquetas de peso variable
-- (docs/design/PRODUCTOS-POR-PESO-BASCULA.md §2.7, M3).
--
-- Una balanza etiquetadora imprime un EAN-13 de uso interno GS1:
--   PP (prefijo 21–29) + PLU (4–6) + [dígito de control del valor] + valor (4–6) + dígito EAN.
-- 2 + PLU + valor (+1) = 12 dígitos antes del de control. El formato es de la
-- organización y vive junto a la numeración interna de códigos
-- (organization_barcode_settings), que ya ocupa el prefijo 20: por eso el 20 no
-- está en la lista permitida y la RPC rechaza un prefijo igual al del generador.
--
-- Decisión del dueño (2026-09-29): peso embebido, prefijo 27, PLU de 5 dígitos
-- y peso de 5 dígitos en gramos. Aquí solo quedan los DEFAULT neutros
-- (desactivado, sin prefijos): cada organización lo activa en
-- Configuración › POS › «Etiquetas de peso variable».
--
-- Aditiva: 6 columnas con DEFAULT constante sobre 7 filas.

alter table public.organization_barcode_settings
  add column if not exists weight_label_enabled boolean not null default false,
  add column if not exists weight_label_prefixes text[] not null default '{}',
  add column if not exists weight_label_content text not null default 'weight',
  add column if not exists weight_label_plu_digits smallint not null default 5,
  add column if not exists weight_label_value_digits smallint not null default 5,
  add column if not exists weight_label_value_check boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'obs_weight_label_check'
       and conrelid = 'public.organization_barcode_settings'::regclass
  ) then
    alter table public.organization_barcode_settings
      add constraint obs_weight_label_check check (
        weight_label_content in ('weight', 'price')
        and weight_label_plu_digits between 4 and 6
        and weight_label_value_digits between 4 and 6
        and 2 + weight_label_plu_digits + weight_label_value_digits
            + case when weight_label_value_check then 1 else 0 end = 12
        and weight_label_prefixes <@ array['21','22','23','24','25','26','27','28','29']::text[]
        and (not weight_label_enabled or cardinality(weight_label_prefixes) > 0)
      );
  end if;
end;
$$;

comment on column public.organization_barcode_settings.weight_label_enabled is
  'Etiquetas de peso variable: el POS decodifica EAN-13 con estos prefijos cuando el código exacto no existe.';
comment on column public.organization_barcode_settings.weight_label_prefixes is
  'Prefijos GS1 de uso interno (21–29) de las etiquetas de balanza. Nunca el del generador interno.';
comment on column public.organization_barcode_settings.weight_label_content is
  'weight: el valor es el peso en gramos (o milésimas de libra); price: el valor es el importe en la moneda.';
comment on column public.organization_barcode_settings.weight_label_plu_digits is
  'Dígitos del PLU en la etiqueta (4–6). El PLU es products.scale_plu.';
comment on column public.organization_barcode_settings.weight_label_value_digits is
  'Dígitos del valor (peso o precio) en la etiqueta (4–6).';
comment on column public.organization_barcode_settings.weight_label_value_check is
  'La etiqueta lleva un dígito de control del valor entre el PLU y el valor.';
