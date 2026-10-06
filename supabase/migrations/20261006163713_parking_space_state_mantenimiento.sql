-- Aplicada el 2026-10-06 con apply_migration (versión 20261006163713).
-- Urgente parqueadero: «Poner en mantenimiento» (mapa, espacios, acciones masivas, importación)
-- fallaba con 22P02: parking_space_state solo tenía free, occupied, reserved, y la pantalla de
-- espacios ofrece además maintenance y disabled (Mantenimiento / Deshabilitado).
-- Aditiva: solo añade valores al enum. Nada en la base filtra por estos dos valores.
-- Ensayo (do $$ … raise exception $$ como authenticated, org 325): antes de aplicarla,
-- update parking_spaces set state = 'maintenance' → 22P02. El alter type dentro del bloque de
-- ensayo compila; el valor nuevo solo se puede usar después de confirmada la transacción.
set lock_timeout = '10s';
alter type public.parking_space_state add value if not exists 'maintenance';
alter type public.parking_space_state add value if not exists 'disabled';
comment on type public.parking_space_state is 'Estado del espacio: free, occupied, reserved, maintenance (en mantenimiento), disabled (fuera de servicio). Los dos últimos los pone la pantalla de espacios y el mapa.';
