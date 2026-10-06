-- Postgres no permite quitar valores de un enum. Reversión: no se usan (ningún espacio los tenía
-- antes de esta migración). Para retirarlos haría falta recrear el tipo; no se hace con datos.
select 1;
