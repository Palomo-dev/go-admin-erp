-- Rollback de 20261027243000_fn_marcar_pedido_web_pagado_pasarela.sql: la función no existía en prod.
-- ORDEN COMPLETO (aplicar): 20261027241500 → 20261027243000 → 20261027244000 → 20261027245000 → 20261027242000
--   (la 242000 SOLO tras confirmar en el panel de Wompi). ROLLBACK en orden INVERSO:
--   242000 → 245000 → 244000 → 243000 → 241500.
--   20261027246000 (liberar reservas de cancelados) es INDEPENDIENTE: va aparte, con su respaldo y su rollback.
-- Los pagos que haya creado (reference 'MANUAL', processor_response->>'confirmacion' = 'manual') NO se borran aquí:
-- son cobros reales con asiento; revertirlos es una decisión contable aparte.
set lock_timeout = '3s';
begin;
drop function if exists public.fn_marcar_pedido_web_pagado_pasarela(uuid, jsonb);
commit;
