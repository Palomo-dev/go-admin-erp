-- Rollback de 20261008133820_plano_elementos_fijos (M1).
--
-- Orden: revierte antes 20261008140014_plano_guardar_sede (E9) y
-- 20261008134326_plano_publico_rpc (M3), que leen y escriben esta tabla, y el
-- código del ERP que la usa (src/components/pos/mesas/plano/planoService.ts).
--
-- ADVERTENCIA: borra los elementos fijos que los dueños hayan dibujado. La
-- tabla es nueva (no traía datos de clientes), pero desde su creación sí
-- puede tenerlos: respáldalos antes si hace falta
-- (select * from public.restaurant_floor_elements).

drop trigger if exists trg_restaurant_floor_elements_valida_sede on public.restaurant_floor_elements;
drop table if exists public.restaurant_floor_elements;
drop function if exists public.fn_restaurant_floor_elements_valida_sede();
