-- Punto 6, regla 7 (2026-09-24): pos_anular_venta_v1 anula cada pago con
-- fn_anular_pago, la anulación única de pagos que otra sesión publicó el mismo
-- día (estado 'void', contra-asiento del cobro, cuotas, recibo y auditoría
-- financiera), en vez de su propia copia (status 'cancelled' + reverso).
-- Se conserva la regla del POS: si CUALQUIER pago de la venta entró en una
-- caja que ya no está abierta, no se anula (devolución); y el periodo contable
-- de hoy debe estar abierto para revertir su asiento.
-- Parche sobre la definición viva de pos_anular_venta_v1 (20260925140200).

do $parche$
declare
  v_oid oid := 'public.pos_anular_venta_v1(uuid, text)'::regprocedure;
  v_def text := pg_get_functiondef('public.pos_anular_venta_v1(uuid, text)'::regprocedure);
  v_old0 text := $frag0$    for v_je in
      select je.id from public.journal_entries je
       where je.organization_id = v_sale.organization_id
         and je.fact_key = 'settlement:payment:' || v_pago.id::text
         and coalesce(je.posted, false)
         and not exists (select 1 from public.journal_entries r
                          where r.organization_id = je.organization_id and r.fact_key = 'reversal:' || je.id)
    loop
      if v_periodo_ok is null then
        v_periodo_ok := public.fn_is_period_open(v_sale.organization_id, public.fn_today_for(v_sale.organization_id, v_sale.branch_id));
        if not v_periodo_ok then
          raise exception 'periodo_cerrado' using errcode = '22023';
        end if;
      end if;
      perform public.fn_revertir_asiento_en_fecha(v_je.id, 'anulacion', 'venta-' || left(v_sale.id::text, 8), now(), v_uid);
      v_n_asientos := v_n_asientos + 1;
    end loop;

    update public.payments set status = 'cancelled', updated_at = now() where id = v_pago.id;
    v_n_pagos := v_n_pagos + 1;
  end loop;$frag0$;
  v_new0 text := $frag0$    if v_periodo_ok is null and exists (
      select 1 from public.journal_entries je
       where je.organization_id = v_sale.organization_id
         and je.fact_key = 'settlement:payment:' || v_pago.id::text
         and coalesce(je.posted, false)
    ) then
      v_periodo_ok := public.fn_is_period_open(v_sale.organization_id, public.fn_today_for(v_sale.organization_id, v_sale.branch_id));
      if not v_periodo_ok then
        raise exception 'periodo_cerrado' using errcode = '22023';
      end if;
    end if;

    -- La anulación del pago es la única del sistema (fn_anular_pago): estado
    -- 'void', contra-asiento del cobro, cuotas, recibo y auditoría financiera.
    select public.fn_anular_pago(v_pago.id, v_motivo) as r into v_je;
    if (v_je.r->>'contra_asiento') is not null then
      v_n_asientos := v_n_asientos + 1;
    end if;
    v_n_pagos := v_n_pagos + 1;
  end loop;$frag0$;
begin
  if position($m$public.fn_anular_pago($m$ in v_def) > 0 then
    raise notice 'public.pos_anular_venta_v1(uuid, text): el cambio ya estaba aplicado; nada que hacer';
    return;
  end if;
  if (length(v_def) - length(replace(v_def, v_old0, ''))) / length(v_old0) <> 1 then
    raise exception 'public.pos_anular_venta_v1(uuid, text): el fragmento 1 no aparece exactamente una vez; la función cambió';
  end if;
  v_def := replace(v_def, v_old0, v_new0);
  execute v_def;
  if position($m$public.fn_anular_pago($m$ in pg_get_functiondef(v_oid)) = 0 then
    raise exception 'public.pos_anular_venta_v1(uuid, text): no quedó con el cambio';
  end if;
end $parche$;
