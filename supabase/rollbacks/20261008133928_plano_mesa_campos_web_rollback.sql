-- Rollback de 20261008133928_plano_mesa_campos_web (M2).
--
-- Orden: revierte antes M5, M4, M3 y E9 (20261008135016, 20261008134614,
-- 20261008134326 y 20261008140014), que leen o escriben estas columnas,
-- y el código del ERP que las edita (PanelMesaPlano / planoService).
--
-- ADVERTENCIA: se pierde lo que los dueños hayan marcado en «Se puede reservar
-- en la web» y el rango de personas web de cada mesa.

alter table public.restaurant_tables drop constraint if exists restaurant_tables_web_party_check;
alter table public.restaurant_tables drop column if exists web_max_party;
alter table public.restaurant_tables drop column if exists web_min_party;
alter table public.restaurant_tables drop column if exists is_web_bookable;
