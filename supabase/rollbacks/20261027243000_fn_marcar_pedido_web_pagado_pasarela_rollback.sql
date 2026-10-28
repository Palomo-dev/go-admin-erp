-- Rollback de 20261027243000_fn_marcar_pedido_web_pagado_pasarela.sql: la función no existía en prod.
-- Los pagos que haya creado (reference 'MANUAL', processor_response->>'confirmacion' = 'manual') NO se borran aquí:
-- son cobros reales con asiento; revertirlos es una decisión contable aparte.
set lock_timeout = '3s';
begin;
drop function if exists public.fn_marcar_pedido_web_pagado_pasarela(uuid, jsonb);
commit;
