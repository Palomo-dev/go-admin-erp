-- NO APLICAR.
--
-- Propuesta para numerar los comprobantes de asientos que ya estaban
-- publicados cuando se creo el consecutivo. No esta en supabase/migrations
-- y no se ejecuto. No toca facturas, productos, lineas ni saldos.
--
-- Un asiento publicado no se edita. Por eso el update va con
-- app.contabilidad_mantenimiento = 'on'. Sin esa variable el disparador
-- de inmutabilidad lo rechaza.
--
-- El bloque aborta solo. Hay que borrar el raise exception para correrlo,
-- dentro de una transaccion, y revisar antes el diagnostico.
-- El orden es la fecha del asiento y luego el id. El numero siguiente
-- de cada organizacion y tipo queda despues del ultimo asignado, asi no
-- choca con los comprobantes que ya nacieron despues de la fase 5.
-- Los asientos de banco y los que no son factura, caja ni nota manual
-- se quedan sin numero.

-- ---------------------------------------------------------------------------
-- Parte 1. Diagnostico. Solo lee.
-- ---------------------------------------------------------------------------

select e.source,
       count(*) as publicados_sin_numero
  from public.journal_entries e
 where coalesce(e.posted, false)
   and e.comprobante_numero is null
 group by e.source
 order by publicados_sin_numero desc;

-- ---------------------------------------------------------------------------
-- Parte 2. No se ejecuta mientras este el raise.
-- ---------------------------------------------------------------------------

do $propuesta$
declare
  v_prev text;
  r record;
  v_tipo text;
  v_prefijo text;
  v_mov text;
  v_num integer;
  v_pref text;
begin
  raise exception 'Propuesta sin aplicar. Borre este raise para numerar comprobantes historicos.';

  v_prev := current_setting('app.contabilidad_mantenimiento', true);
  perform set_config('app.contabilidad_mantenimiento', 'on', true);

  for r in
    select e.id, e.organization_id, e.source, e.source_id
      from public.journal_entries e
     where coalesce(e.posted, false)
       and e.comprobante_numero is null
     order by e.organization_id, e.entry_date, e.id
  loop
    v_tipo := null;
    v_prefijo := null;
    if r.source in ('invoice_sales', 'invoice_purchase', 'credit_note', 'support_documents') then
      v_tipo := 'factura';
      v_prefijo := 'FV';
    elsif r.source = 'manual' then
      v_tipo := 'nota_contable';
      v_prefijo := 'NA';
    elsif r.source = 'cash_movements' and r.source_id is not null then
      select cm.type into v_mov
        from public.cash_movements cm
       where cm.id::text = r.source_id
         and cm.organization_id = r.organization_id;
      if v_mov = 'in' then
        v_tipo := 'recibo_caja';
        v_prefijo := 'RC';
      elsif v_mov = 'out' then
        v_tipo := 'comprobante_egreso';
        v_prefijo := 'CE';
      end if;
    end if;

    if v_tipo is null then
      continue;
    end if;

    select c.numero, c.prefijo into v_num, v_pref
      from public.fn_tomar_consecutivo_comprobante(r.organization_id, v_tipo, v_prefijo) c;

    update public.journal_entries
       set comprobante_tipo = v_tipo,
           comprobante_prefijo = v_pref,
           comprobante_numero = v_num
     where id = r.id
       and comprobante_numero is null;
  end loop;

  perform set_config('app.contabilidad_mantenimiento', coalesce(v_prev, ''), true);
end
$propuesta$;
