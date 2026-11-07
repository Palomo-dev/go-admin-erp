-- Reversión de 20261107220000_metodo_pago_con_pagos_no_se_borra.
-- Solo quita la guarda: no toca datos.

drop trigger if exists trg_metodo_pago_con_pagos_no_se_borra on public.organization_payment_methods;
drop function if exists public.fn_metodo_pago_con_pagos_no_se_borra();
