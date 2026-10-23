-- Borradores de reclasificación. Uno por organización avisada, sin publicar.
-- No modifica journal_lines existentes. Reversión:
-- supabase/rollbacks/20261023143100_reglas_contables_juan_borradores_rollback.sql
-- Si un borrador ya se publicó, primero fn_revertir_asiento y después el rollback.

set lock_timeout = '8s';
set statement_timeout = '40s';

select public.fn_regla_contable_reclasificar();
