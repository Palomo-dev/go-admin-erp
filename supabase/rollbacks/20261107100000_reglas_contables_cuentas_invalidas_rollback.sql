-- Rollback de 20261107100000_reglas_contables_cuentas_invalidas.sql.
-- Quita el bloqueo, el diagnóstico y el saneamiento de empresas nuevas.
-- No revierte datos: las reglas de una empresa creada mientras estuvo activo trg_zzzzz_reglas_saneadas conservan
-- la cuenta corregida. Las reglas que existían al aplicar no se tocaron.
-- Orden: revertir antes 20261107101000, cuya siembra usa fn_cuenta_fallo_en_regla.
drop trigger if exists trg_zzzzz_reglas_saneadas on public.organizations;
drop trigger if exists trg_accounting_rules_validar_cuentas on public.accounting_rules;
drop function if exists public.trg_fn_reglas_sanear_org_nueva();
drop function if exists public.fn_reglas_sanear_org_nueva(integer);
drop function if exists public.fn_reglas_contables_diagnostico(integer);
drop function if exists public.fn_reglas_cuentas_invalidas(integer);
drop function if exists public.fn_accounting_rules_validar_cuentas();
drop function if exists public.fn_regla_fallo_cuenta(integer, text);
drop function if exists public.fn_cuenta_fallo_en_regla(integer, text);
