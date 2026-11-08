-- Reversión de 20261108100500_tributario_calendario.sql (calendario tributario nacional).
-- Migración aplicada por el MCP el 2026-11-07 con orden del dueño.
-- Si ya se cargaron fechas, respaldarlas antes. Sin la tabla, el Centro tributario vuelve a decir
-- «calendario pendiente de activar» en cada vencimiento.

drop table if exists public.tax_calendar_dates;
