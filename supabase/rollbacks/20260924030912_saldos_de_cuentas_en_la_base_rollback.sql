-- Rollback de 20260924030912_saldos_de_cuentas_en_la_base.sql
-- Antes de aplicarlo, ReportesContablesService debe volver a sumar las líneas
-- en el navegador (con el truncamiento de 1.000 filas que eso implica).
drop function if exists public.fn_saldos_cuentas(integer, timestamptz, timestamptz);
