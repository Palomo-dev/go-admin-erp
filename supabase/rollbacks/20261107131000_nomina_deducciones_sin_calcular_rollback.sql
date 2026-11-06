-- Reversión de 20261107131000_nomina_deducciones_sin_calcular.sql
-- Advertencia: no restaura datos. Las colillas que hayan quedado con tax_withholding o
-- loan_deductions en NULL siguen así, y sin estas guardas se podrían aprobar en ese estado.
-- Antes de revertir, confirme que no haya colillas en borrador con esas columnas en NULL.

drop trigger if exists trg_nomina_periodo_bloquear_cierre on public.payroll_periods;
drop trigger if exists trg_nomina_colilla_deducciones on public.payroll_slips;
drop function if exists public.fn_nomina_fijar_deduccion(uuid, text, numeric, text);
drop function if exists public.fn_trg_nomina_periodo_bloquear_cierre();
drop function if exists public.fn_trg_nomina_colilla_deducciones();
drop function if exists public.fn_nomina_run_vigente(uuid);

alter table public.payroll_slips alter column tax_withholding set default 0;
comment on column public.payroll_slips.tax_withholding is null;
comment on column public.payroll_slips.loan_deductions is null;
