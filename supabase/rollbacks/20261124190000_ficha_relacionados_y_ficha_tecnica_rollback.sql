-- Rollback de 20261124190000_ficha_relacionados_y_ficha_tecnica.sql
--
-- AVISO: no restaura datos. Borra los relacionados elegidos a mano (`product_relations`) y las
-- filas propias de la ficha técnica (`products.specifications`) que se hayan escrito. Si hay que
-- conservarlos, cópialos antes:
--   create table bak_product_relations as select * from public.product_relations;
--   create table bak_products_specifications as select id, specifications from public.products where specifications is not null;
--
-- La tienda y el ERP toleran que no existan (la tienda pinta los relacionados de siempre y la
-- ficha técnica sin filas propias), pero el ERP mostraría un error al abrir la pestaña Tienda.

drop function if exists public.fn_comprados_juntos(integer, integer, integer, integer);

drop trigger if exists trg_product_relations_antes on public.product_relations;
drop table if exists public.product_relations;
drop function if exists public.fn_product_relations_antes();

alter table public.products drop constraint if exists products_specifications_es_lista;
alter table public.products drop column if exists specifications;
