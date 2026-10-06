-- Postgres no permite quitar valores de un enum. Reversión de datos: devolver a 'free' los
-- espacios que se hayan puesto en mantenimiento o deshabilitados; los valores quedan sin uso.
-- Para retirarlos haría falta recrear el tipo; no se hace con datos de clientes.
update public.parking_spaces set state = 'free' where state::text in ('maintenance', 'disabled');
