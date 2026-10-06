-- Reversión de 20261008120000_sitio_web_ventas_sedes.sql (SIN APLICAR).
--
-- Quita lo que agregó esa migración. Las columnas nuevas no tienen datos de
-- clientes hasta que alguien guarde desde Sitio web; si ya los tienen, esta
-- reversión los pierde: respaldar antes (select … into una tabla temporal).
--
-- organization_domains.branch_id: solo si NO la creó también el área dominios
-- (su migración usa el mismo nombre). Si la de dominios ya está aplicada, NO
-- correr el bloque de organization_domains.

drop function if exists public.fn_sitio_web_guardar_sedes(integer, text, jsonb);

drop index if exists public.idx_organization_domains_org_branch;
alter table public.organization_domains drop column if exists branch_id;

alter table public.website_settings drop constraint if exists website_settings_multi_outlet_mode_check;
alter table public.website_settings drop column if exists multi_outlet_mode;

alter table public.website_settings drop constraint if exists website_settings_checkout_min_order_amount_check;
alter table public.website_settings drop column if exists checkout_min_order_amount;
alter table public.website_settings drop column if exists checkout_guest_enabled;
