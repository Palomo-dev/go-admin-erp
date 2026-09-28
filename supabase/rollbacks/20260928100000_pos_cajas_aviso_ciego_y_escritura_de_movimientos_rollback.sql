-- Reversión de 20260928100000_pos_cajas_aviso_ciego_y_escritura_de_movimientos.
-- Vuelve a la política ALL por pertenencia y al aviso de cierre con cifras.
-- Antes de aplicarla, el código que llama a pos_caja_registrar_movimiento debe
-- volver al INSERT directo (o se pierde el registro de movimientos).

drop function if exists public.pos_caja_registrar_movimiento(integer, text, numeric, text, text, text, text, uuid, timestamptz);

drop policy if exists cash_movements_insert_caja_abierta on public.cash_movements;
drop policy if exists cash_movements_update_caja_abierta on public.cash_movements;

create policy cash_movements_insert_update_delete_policy on public.cash_movements
  for all to authenticated
  using (
    organization_id in (
      select organization_members.organization_id from public.organization_members
       where organization_members.user_id = auth.uid()
    )
  );

create or replace function public.fn_notify_cash_session_closed()
returns trigger
language plpgsql
security definer
as $function$
DECLARE
  v_user_email TEXT;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'closed' THEN
    SELECT email INTO v_user_email FROM auth.users WHERE id = NEW.closed_by;

    PERFORM fn_create_org_notification(
      NEW.organization_id,
      NULL,
      'app',
      'cash_closed',
      'Caja cerrada',
      'Cerrada por ' || COALESCE(v_user_email, 'un usuario') || '. Monto final: $' || COALESCE(NEW.final_amount::text, '0') || '. Diferencia: $' || COALESCE(NEW.difference::text, '0'),
      jsonb_build_object('session_id', NEW.id::text, 'difference', COALESCE(NEW.difference, 0)::text)
    );
  END IF;
  RETURN NEW;
END;
$function$;
