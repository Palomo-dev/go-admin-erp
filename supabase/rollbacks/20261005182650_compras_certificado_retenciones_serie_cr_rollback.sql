-- Rollback de 20261005182650_compras_certificado_retenciones_serie_cr.
--
-- Retira la función que expide certificados y la tabla de certificados
-- expedidos. ADVERTENCIA: borra los certificados expedidos (número, periodo y
-- foto de lo certificado) y no hay forma de restaurarlos. Antes de aplicarlo,
-- exportar public.withholding_certificates si ya se expidió alguno. El
-- documento vuelve a armarse al vuelo desde fn_certificado_retenciones_proveedor,
-- que esta migración no tocó.

drop function if exists public.fn_certificado_retenciones_expedir(integer, integer, date, date, integer);
drop table if exists public.withholding_certificates;
