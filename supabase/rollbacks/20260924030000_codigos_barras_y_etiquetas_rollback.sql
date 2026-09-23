-- Rollback de 20260924030000_codigos_barras_y_etiquetas.
--
-- NO restaura datos: los códigos que las funciones ya asignaron en
-- products.barcode se quedan (son códigos válidos y quizá ya impresos). Se
-- pierde la configuración de numeración de cada organización.
--
-- El CHECK de print_jobs vuelve a la lista anterior. Si ya hay filas con
-- job_type 'shipment_guide' o 'product_label', el ADD CONSTRAINT falla: hay
-- que borrarlas (o marcarlas) antes, a sabiendas. El código que llama a estas
-- funciones (codigosBarrasService, diálogos de etiquetas) deja de funcionar
-- hasta revertirlo también.

alter table public.print_jobs drop constraint if exists print_jobs_job_type_check;
alter table public.print_jobs add constraint print_jobs_job_type_check check (
  job_type = any (array[
    'kitchen_ticket'::text, 'pre_cuenta'::text, 'sale_ticket'::text, 'electronic_invoice'::text,
    'open_cash_drawer'::text
  ])
);

drop function if exists public.codigos_barras_verificar(integer, text, integer[]);
drop function if exists public.codigos_barras_generar_faltantes(integer, integer[], boolean);
drop function if exists public.codigos_barras_reservar(integer, integer);
drop function if exists public.codigos_barras_configurar(integer, text, text, bigint, integer);
drop function if exists public._codigos_barras_tomar(integer, integer);
drop function if exists public.fn_codigo_barras_construir(text, text, bigint, integer);

drop index if exists public.idx_products_org_barcode;

drop table if exists public.organization_barcode_settings;
