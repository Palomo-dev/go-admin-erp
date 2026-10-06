-- Aplicada el 2026-10-06 con apply_migration (versión 20261006162510).
-- Urgente: crear un espacio de moto fallaba con 22P02 (parking_space_type no tenía 'motorcycle').
-- El enum tenía car, motor, disabled; el resto del módulo (parking_rates, parking_sessions,
-- parking_vehicles, la UI) usa car, motorcycle, truck, bicycle. Aditiva: solo añade valores.
set lock_timeout = '10s';
alter type public.parking_space_type add value if not exists 'motorcycle';
alter type public.parking_space_type add value if not exists 'truck';
alter type public.parking_space_type add value if not exists 'bicycle';
comment on type public.parking_space_type is 'Tipo de espacio: car, motorcycle, truck, bicycle (los mismos de parking_rates, parking_sessions y parking_vehicles), disabled (discapacidad). motor es el valor antiguo de moto, sin uso.';
