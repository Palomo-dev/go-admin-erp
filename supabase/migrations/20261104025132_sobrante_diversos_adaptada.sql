-- Sobrante · Ningún movimiento de stock contabiliza contra 4250
-- ADAPTADA (2026-11-04) del bloque #13 (do $patch$ sobre fn_auto_journal_stock_movement)
-- de 20261023190000_sobrante_diversos.sql, que no entró al restaurar la base en el
-- proyecto taqjemqjtumhwptchcxk («no se encontro el ancla de fn_auto_journal_stock_movement»).
--
-- ── Por qué falló el ancla ─────────────────────────────────────────────────────
-- La restauración aplicó los archivos por nombre: 20261023181348 reemplazó la
-- función SIN el bloque «entrada_clase_6» (el ancla), y 20261023190000 llegó
-- después. El respaldo que la propia migración guardó en
-- public.sobrante_funcion_respaldo (md5 d9c69fee5b922abef8600f721ef0136c) no trae
-- 'entrada_clase_6': confirma que el ancla no existía en ese momento.
-- Luego 20261023211500 restauró la protección y 20261025134030 reescribió la función
-- entera. La definición viva hoy es EXACTAMENTE la de 20261025134030
-- (md5(prosrc) 42c746274a0f655dea9a25dc001ffc78, verificado contra el archivo) y el
-- ancla original ya aparece una sola vez.
--
-- OJO, antes de aplicar: en el proyecto anterior este parche se aplicó a las 17:09
-- (sobrante_parches_asiento, 20261023170952) y 20261023181348 (18:13) lo pisó. Ni
-- 20261023211500 ni 20261025134030 —escritas sobre la función viva de entonces— lo
-- traen. Es decir: producción NO tenía este bloque desde el 23-oct 18:13. Aplicar esta
-- adaptada AGREGA un comportamiento que producción no tenía; no es «restaurar».
-- Hoy es una red de seguridad: con la configuración actual ninguna ruta da 4250
-- (0 reglas de inventario, 0 branch_account_mappings y 0 configuracion_contable con
-- 4250; fn_cuentas_movimiento_stock ya acredita 42959501 en ganancia y 37050501 en
-- apertura). Decidir con contabilidad si se quiere.
--
-- ── Qué cambia respecto al original ───────────────────────────────────────────
--   1. El reemplazo de array['4250','4295','4210'] por array['4295','4210'] se OMITE:
--      la función viva ya no tiene ese arreglo; 20261025134030 lo cambió por
--      fn_primera_cuenta_detalle(org, array[fn_cuenta_ingresos_diversos(org, sede)]).
--   2. 4250 → ingresos diversos: se conserva, pero el relevo es
--      fn_cuenta_ingresos_diversos(org, sede) (el resolver a auxiliar de 20261025134030)
--      en vez de fn_cuenta_configurada(…, 'ingresos_diversos', '4295') con respaldo
--      literal '4295'. Motivo: 4295 pasa a título en 20261025134060 y un asiento nunca
--      se postea a un título. Si aun así queda 4250 (o la cuenta sale nula), el
--      movimiento NO se contabiliza y queda en fn_log_journal_failure con motivo
--      'sobrante_cuenta' (mismo motivo que usa fn_auto_journal_inventory_adjustment),
--      en vez de forzar 4295.
--   3. 1405 → auxiliar de 1435 (débito y crédito de apertura/diversos): se OMITE.
--      Desde el QA del 25-oct fn_cuentas_movimiento_stock nunca devuelve 1405; la única
--      fuente de 1405 es fn_cuentas_stock_producto, que asigna A PROPÓSITO la cuenta de
--      insumos (1405…) a productos de hoteles y restaurantes (type_id 1 y 2). El
--      reemplazo original desharía esa regla posterior en aperturas y ganancias.
--   4. Guard nuevo: md5(prosrc) 42c746274a0f655dea9a25dc001ffc78 → 8b0338f49c3f7f6044bd6dcf366d6de8.
--      «Ya aplicada» se detecta por el marcador «Sobrante (20261023190000, adaptada».
--      Ni firma, ni SECURITY DEFINER, ni search_path, ni permisos, ni el disparador cambian.
--   5. No toca datos ni asientos ya hechos.
--
-- Rollback: 20261023190000_sobrante_diversos_adaptada_rollback.sql
-- (NO usar el rollback original para deshacer esto: reinstala los respaldos de
-- sobrante_funcion_respaldo, tomados de la restauración, y pisaría 20261023211500 y
-- 20261025134030.)

do $patch$
declare
  v_oid oid := 'public.fn_auto_journal_stock_movement()'::regprocedure;
  v_md5 text;
  v_src text;
  v_def text;
  v_old text := $old$        'entrada_clase_6', 'Una entrada que no es devolución no acredita la clase 6');
      return new;
    end if;
  end if;

  begin$old$;
  v_new text := $new$        'entrada_clase_6', 'Una entrada que no es devolución no acredita la clase 6');
      return new;
    end if;
  end if;

  -- Sobrante (20261023190000, adaptada 2026-11-04): ningún movimiento de stock usa 4250.
  -- El relevo es la cuenta de ingresos diversos resuelta a auxiliar (20261025134030).
  if left(coalesce(v_credit_account, ''), 4) = '4250' then
    v_credit_account := public.fn_cuenta_ingresos_diversos(new.organization_id, new.branch_id);
  end if;
  if left(coalesce(v_debit_account, ''), 4) = '4250' then
    v_debit_account := public.fn_cuenta_ingresos_diversos(new.organization_id, new.branch_id);
  end if;
  if v_debit_account is null or v_credit_account is null
     or left(coalesce(v_credit_account, ''), 4) = '4250'
     or left(coalesce(v_debit_account, ''), 4) = '4250' then
    perform public.fn_log_journal_failure(
      new.organization_id, new.branch_id, coalesce(new.created_at, now()),
      'stock_movements', new.id::text, v_fact_key, v_debit_account, v_credit_account, v_amount,
      'sobrante_cuenta', 'Un movimiento de stock no usa 4250 y no hay cuenta de ingresos diversos');
    return new;
  end if;

  begin$new$;
begin
  if to_regprocedure('public.fn_cuenta_ingresos_diversos(integer,integer)') is null then
    raise exception 'falta fn_cuenta_ingresos_diversos: aplicar antes 20261025134030';
  end if;
  select prosrc, md5(prosrc) into v_src, v_md5 from pg_proc where oid = v_oid;
  if position('Sobrante (20261023190000, adaptada' in v_src) > 0 then
    return;  -- ya aplicada
  end if;
  if v_md5 <> '42c746274a0f655dea9a25dc001ffc78' then
    raise exception 'fn_auto_journal_stock_movement cambió (md5 %): revisar a mano', v_md5;
  end if;
  v_def := pg_get_functiondef(v_oid);
  if (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old) <> 1 then
    raise exception 'fn_auto_journal_stock_movement: el ancla no aparece una sola vez';
  end if;
  execute replace(v_def, v_old, v_new);
  select md5(prosrc) into v_md5 from pg_proc where oid = v_oid;
  if v_md5 <> '8b0338f49c3f7f6044bd6dcf366d6de8' then
    raise exception 'fn_auto_journal_stock_movement: md5 final inesperado (%)', v_md5;
  end if;
end
$patch$;
