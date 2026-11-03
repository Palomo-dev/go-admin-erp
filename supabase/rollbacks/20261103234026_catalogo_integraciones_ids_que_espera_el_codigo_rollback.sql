-- Rollback de 20261103234026: no se revierte a propósito. Los UUID que reemplazó eran
-- aleatorios (generados al resembrar el catálogo el 2026-11-03) y ningún código ni dato
-- los usa; volver a ellos solo rompería los webhooks y servicios que cablean los UUID
-- restaurados. Si hiciera falta deshacer el catálogo completo, usar el rollback de la
-- migración que lo sembró (seeded_by = 'catalogo-integraciones-20261103').
select 1;
