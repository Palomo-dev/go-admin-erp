-- Reversion de 20260924170000_bank_files_rastro_de_exportacion_a_banca.sql
--
-- AVISO: esta reversion BORRA el rastro de los lotes exportados a banca online.
-- La migracion crea una tabla nueva y vacia, asi que revertirla inmediatamente no
-- pierde nada; revertirla despues de que la aplicacion haya exportado lotes SI
-- pierde esas filas y no hay forma de reconstruirlas. Volcar antes:
--
--   select * from public.bank_files order by upload_date;
--
-- Y recordar que sin la tabla `exportarParaBancaOnline` vuelve a no poder
-- registrar nada: la descarga sigue funcionando (es lo primero que hace el
-- modal), pero cada exportacion avisara de que no quedo registrada.

drop policy if exists bank_files_update_por_pertenencia on public.bank_files;
drop policy if exists bank_files_insert_por_pertenencia on public.bank_files;
drop policy if exists bank_files_select_por_pertenencia on public.bank_files;

drop index if exists public.bank_files_org_upload_idx;

drop table if exists public.bank_files;
