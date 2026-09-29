-- Inventario B4 · P8 (fase 1): el serial es único por organización.
--
-- Hoy `serial_numbers_serial_key UNIQUE (serial)` es global: una organización
-- no puede registrar un serial que otra ya tiene (dos tiendas que venden el
-- mismo modelo de fabricante chocan). P8 aprobado: unicidad por organización,
-- en dos fases.
--
-- Fase 1 (esta): índice único aditivo `(organization_id, serial)`. Con el
-- índice global aún vigente no cambia ningún comportamiento; deja lista la
-- restricción que queda cuando B10 retire `serial_numbers_serial_key` (fase 2,
-- cuando el núcleo B0 y las recepciones B8 validen por organización).
--
-- Verificado antes de aplicar (2026-09-28): 102 seriales, 0 pares
-- (organization_id, serial) repetidos. Sin CONCURRENTLY: apply_migration corre
-- en una transacción y la tabla tiene 102 filas.

create unique index if not exists serial_numbers_org_serial_key
  on public.serial_numbers (organization_id, serial);

comment on index public.serial_numbers_org_serial_key is
  'P8 fase 1 (inventario B4): unicidad del serial por organización. La global serial_numbers_serial_key se retira en B10.';
