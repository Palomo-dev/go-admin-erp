-- Finanzas ronda 2, frente B, pieza A12 (2026-11-07).
-- Aplicada por el MCP el 2026-11-07 con orden del dueño (docs/POLITICA-MIGRACIONES.md).
--
-- Un método de pago con pagos registrados se desactiva, no se elimina. La
-- pantalla ya lo respeta (cuenta `payments.method` antes de ofrecer «Eliminar»),
-- pero el borrado se hace desde el navegador sobre
-- `organization_payment_methods`: sin esta guarda, una llamada directa a la API
-- lo seguiría borrando. Los pagos guardan el código en `payments.method` (texto,
-- sin llave foránea), así que el vínculo es la única fuente del nombre propio,
-- las sucursales y la contabilidad del método para esos pagos.
--
-- Efecto lateral buscado: borrar un código del catálogo global
-- (`payment_methods`, ON DELETE CASCADE hacia los vínculos) también se rechaza
-- si alguna organización tiene pagos con él.

create or replace function public.fn_metodo_pago_con_pagos_no_se_borra()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if exists (
    select 1
      from public.payments p
     where p.organization_id = old.organization_id
       and p.method = old.payment_method_code
  ) then
    raise exception 'metodo_con_pagos'
      using errcode = 'P0001',
            hint = 'El método tiene pagos registrados: desactívalo (is_active = false) en lugar de eliminarlo.';
  end if;
  return old;
end;
$$;

revoke all on function public.fn_metodo_pago_con_pagos_no_se_borra() from public, anon;

comment on function public.fn_metodo_pago_con_pagos_no_se_borra() is
  'Finanzas ronda 2 (A12): impide borrar el vínculo de un método de pago que tiene pagos (payments.method); se desactiva en su lugar.';

drop trigger if exists trg_metodo_pago_con_pagos_no_se_borra on public.organization_payment_methods;
create trigger trg_metodo_pago_con_pagos_no_se_borra
  before delete on public.organization_payment_methods
  for each row execute function public.fn_metodo_pago_con_pagos_no_se_borra();
