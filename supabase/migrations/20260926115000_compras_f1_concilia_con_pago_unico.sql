-- ============================================================================
-- Compras F1 — conciliación con el pago único de la sesión de ventas y CxC.
--
-- Las migraciones 20260926100000 y 20260926110000 se escribieron sobre la
-- versión de dos funciones leída al empezar la fase, y entre la lectura y la
-- aplicación la sesión de ventas aplicó `cartera_abonos_simetricos` (P1.1) y
-- `pago_unico_registrar_y_anular` (P1.2), que también las redefinen:
--
-- 1. `fn_finanzas_exigir_permiso(integer, text[])`: la creó el pago único con la
--    misma firma y la misma regla (admin por rol 1/2 o super admin, o
--    `check_user_permission`). Se restaura SU versión exacta —error `sin_permiso`
--    con los permisos en `detail`, EXECUTE para authenticated y service_role—
--    porque `fn_registrar_pago` y sus rutas la usan así. Las RPC de compras y CxP
--    la llaman igual.
-- 2. `fn_recalc_invoice_balance_from_payments()`: la rama de VENTA es la de P1.1
--    (incluye `account_receivable` y devuelve a `issued` una factura sin pagos);
--    la rama de COMPRA es la de F1.1 (neto a pagar − pagado de los dos orígenes
--    con descuento, D4 y D5).
-- ============================================================================

create or replace function public.fn_finanzas_exigir_permiso(p_org integer, p_codigos text[])
 returns void
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_uid uuid := auth.uid();
  v_codigo text;
begin
  perform public.fn_assert_acceso_org(p_org);
  if v_uid is null then
    return;  -- solo el service role llega aquí (fn_assert_acceso_org rechaza anon)
  end if;
  if exists (select 1 from public.organization_members om
              where om.user_id = v_uid and om.organization_id = p_org and om.is_active
                and (coalesce(om.is_super_admin, false) or om.role_id in (1, 2))) then
    return;
  end if;
  foreach v_codigo in array coalesce(p_codigos, array[]::text[]) loop
    if public.check_user_permission(v_uid, p_org, v_codigo) then
      return;
    end if;
  end loop;
  raise exception 'sin_permiso' using errcode = '42501',
    detail = jsonb_build_object('permisos', p_codigos)::text;
end;
$function$;

revoke all on function public.fn_finanzas_exigir_permiso(integer, text[]) from public, anon;
grant execute on function public.fn_finanzas_exigir_permiso(integer, text[]) to authenticated, service_role;

create or replace function public.fn_recalc_invoice_balance_from_payments()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  r RECORD;
  v_invoice_id uuid;
  v_paid numeric;
  v_total numeric;
  v_balance numeric;
  v_status text;
  v_new_status text;
BEGIN
  FOR r IN
    SELECT DISTINCT src, sid
    FROM (VALUES
      (CASE WHEN TG_OP <> 'DELETE' THEN NEW.source END,
       CASE WHEN TG_OP <> 'DELETE' THEN NEW.source_id END),
      (CASE WHEN TG_OP <> 'INSERT' THEN OLD.source END,
       CASE WHEN TG_OP <> 'INSERT' THEN OLD.source_id END)
    ) AS t(src, sid)
    WHERE src IN ('invoice_sales', 'invoice_purchase', 'sale', 'account_payable', 'account_receivable')
      AND sid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  LOOP
    v_invoice_id := NULL;

    IF r.src IN ('invoice_purchase', 'account_payable') THEN
      IF r.src = 'invoice_purchase' THEN
        v_invoice_id := r.sid::uuid;
      ELSE
        SELECT invoice_id INTO v_invoice_id FROM accounts_payable WHERE id = r.sid::uuid;
      END IF;

      CONTINUE WHEN v_invoice_id IS NULL;

      SELECT total, status INTO v_total, v_status
      FROM invoice_purchase WHERE id = v_invoice_id;

      CONTINUE WHEN v_total IS NULL;
      CONTINUE WHEN v_status IN ('draft', 'void', 'voided');

      -- Compras (F1.1): neto a pagar (total − retenciones) − pagado de los dos
      -- orígenes, con descuento (D4, D5).
      v_balance := GREATEST(fn_invoice_purchase_neto(v_invoice_id) - fn_invoice_purchase_paid(v_invoice_id), 0);

      UPDATE invoice_purchase
      SET balance = v_balance, updated_at = NOW()
      WHERE id = v_invoice_id AND balance IS DISTINCT FROM v_balance;

      CONTINUE;
    END IF;

    IF r.src = 'invoice_sales' THEN
      v_invoice_id := r.sid::uuid;
    ELSIF r.src = 'account_receivable' THEN
      -- La cartera sin factura la ajusta update_accounts_receivable_on_payment.
      SELECT invoice_id INTO v_invoice_id FROM accounts_receivable WHERE id = r.sid::uuid;
    ELSE
      SELECT id INTO v_invoice_id FROM invoice_sales WHERE sale_id = r.sid::uuid LIMIT 1;
    END IF;

    CONTINUE WHEN v_invoice_id IS NULL;

    SELECT total, status INTO v_total, v_status
    FROM invoice_sales WHERE id = v_invoice_id;

    CONTINUE WHEN v_total IS NULL;
    CONTINUE WHEN v_status IN ('draft', 'void', 'voided');

    v_paid := fn_invoice_sales_paid(v_invoice_id);
    v_balance := GREATEST(v_total - v_paid, 0);

    v_new_status := v_status;
    IF v_paid > 0 THEN
      v_new_status := CASE WHEN v_balance = 0 THEN 'paid' ELSE 'partial' END;
    ELSIF v_status IN ('paid', 'partial') THEN
      -- Se anularon todos los pagos: la factura vuelve a estar solo emitida.
      v_new_status := 'issued';
    END IF;

    UPDATE invoice_sales
    SET balance = v_balance,
        status = v_new_status,
        updated_at = NOW()
    WHERE id = v_invoice_id
      AND (balance IS DISTINCT FROM v_balance OR status IS DISTINCT FROM v_new_status);
  END LOOP;

  RETURN NULL;
END;
$function$;
