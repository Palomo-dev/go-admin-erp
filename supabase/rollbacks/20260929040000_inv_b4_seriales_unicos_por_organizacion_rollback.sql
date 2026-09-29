-- Reversión de 20260929040000_inv_b4_seriales_unicos_por_organizacion.sql.
-- Seguro mientras siga vigente serial_numbers_serial_key (unicidad global).
-- Si B10 ya retiró la global, revertir esto deja los seriales sin unicidad:
-- no revertir sin restaurar antes una de las dos.

drop index if exists public.serial_numbers_org_serial_key;
