-- Inventario B0 · 7/7 — Un solo asiento por ajuste de inventario (P4)
-- docs/implementacion/INVENTARIO-PLAN.md §2 F4.3, §4 D9 y decisión P4 (2026-09-28).
--
-- Hoy cada ajuste aplicado se contabiliza dos veces: una por el documento
-- (fn_auto_journal_inventory_adjustment, al pasar a `posted`) y otra por cada
-- movimiento `adjustment` que genera (fn_auto_journal_stock_movement). 81 ajustes
-- en 7 organizaciones tienen los dos.
--
-- Hacia adelante: si el movimiento pertenece a un documento de ajuste de ganancia
-- o pérdida de la misma organización (los dos tipos que el documento contabiliza),
-- el movimiento no asienta. Los movimientos `adjustment` SIN documento (stock
-- masivo, variantes, GO Assistant) siguen asentando por sí mismos: si no, no
-- tendrían asiento. Los 81 históricos no se tocan: se listan para el contador en
-- INVENTARIO-PLAN.md (anexo B0).
--
-- Parche sobre la definición viva con md5 comprobado; la anterior queda en
-- private.respaldo_funciones.

do $$
declare
  v_firma constant text := 'fn_auto_journal_stock_movement()';
  v_def text := pg_get_functiondef('public.fn_auto_journal_stock_movement()'::regprocedure);
  v_marca constant text := E'    IF NEW.direction NOT IN (''out'', ''in'') THEN';
begin
  if position('P4 (2026-09-28)' in v_def) > 0 then
    return; -- ya aplicada
  end if;
  if md5(v_def) <> '69a391b031b1b5d2fac0a13e1bd757b7' then
    raise exception 'La definición viva de % cambió (md5 %). Releer y rehacer el parche.', v_firma, md5(v_def);
  end if;
  if (length(v_def) - length(replace(v_def, v_marca, ''))) / length(v_marca) <> 1 then
    raise exception 'El marcador no aparece exactamente una vez en %', v_firma;
  end if;

  insert into private.respaldo_funciones (migracion, firma, definicion, md5)
  values ('20260929020600_inv_b0_7', v_firma, v_def, md5(v_def))
  on conflict (migracion, firma) do nothing;

  v_def := replace(v_def, v_marca,
    E'    -- P4 (2026-09-28): los movimientos de un documento de ajuste de ganancia o\n'
    || E'    -- pérdida los contabiliza el documento (fn_auto_journal_inventory_adjustment).\n'
    || E'    IF NEW.source = ''adjustment'' AND NEW.source_id ~ ''^[0-9]{1,9}$'' AND EXISTS (\n'
    || E'        SELECT 1 FROM inventory_adjustments ia\n'
    || E'         WHERE ia.id = NEW.source_id::integer\n'
    || E'           AND ia.organization_id = NEW.organization_id\n'
    || E'           AND ia.type IN (''gain'', ''loss'')\n'
    || E'    ) THEN\n'
    || E'        RETURN NEW;\n'
    || E'    END IF;\n\n'
    || v_marca);
  execute v_def;
end $$;

revoke all on function public.fn_auto_journal_stock_movement() from anon, public, authenticated;
