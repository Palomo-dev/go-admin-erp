-- Vista previa del asiento de una factura de compra en borrador (diálogo
-- «Confirmar factura de compra» aprobado en Figma: tabla «Asiento que se
-- genera» con cuenta, débito, crédito y la fila «Sumas · cuadra»).
--
-- No se reescribe la contabilidad (regla 7): dentro de un bloque con su propio
-- punto de guardado se hace exactamente lo que hace la confirmación
-- (fn_fc_confirmar_int: status draft -> received), el disparador
-- trg_auto_journal_purchase arma el asiento real (regla de devengo, IVA,
-- retenciones a 2365/2367/2368 y proveedor por el neto), se leen sus líneas
-- y el bloque se deshace siempre con una excepción marcada. Si el disparador
-- no arma asiento (sin regla, periodo cerrado, cuenta faltante), se devuelve
-- el motivo que dejó en journal_entry_failures.
--
-- Efectos que sí quedan: las secuencias (ids de journal_entries,
-- journal_lines, journal_entry_failures, accounts_payable) avanzan, porque
-- nextval no se deshace. No hay otros: la CxP, la comisión y el asiento se
-- deshacen con el bloque.
--
-- Permiso: finance.view o finance.create sobre la organización de la factura
-- (la organización sale de la factura, nunca del cliente), y acceso a su
-- sucursal (fn_fc_acceso_sucursal, igual que al confirmar).

create or replace function public.fn_factura_compra_asiento_previo(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_inv record;
  v_entry integer;
  v_lineas jsonb := '[]'::jsonb;
  v_debitos numeric := 0;
  v_creditos numeric := 0;
  v_motivo text;
  v_detalle text;
  v_error text;
  c_marca constant text := 'PREVIA_ASIENTO_DESHACER';
begin
  select i.id, i.organization_id, i.branch_id, i.status into v_inv
    from invoice_purchase i where i.id = p_id;
  if v_inv.id is null then
    raise exception 'FACTURA_NO_ENCONTRADA' using errcode = 'P0002';
  end if;
  perform public.fn_finanzas_exigir_permiso(v_inv.organization_id, array['finance.view', 'finance.create']);
  perform public.fn_fc_acceso_sucursal(v_inv.branch_id);

  if v_inv.status <> 'draft' then
    return jsonb_build_object('ok', false, 'motivo', 'no_borrador');
  end if;

  begin
    update invoice_purchase set status = 'received', updated_at = now() where id = p_id;

    select e.id into v_entry
      from journal_entries e
     where e.organization_id = v_inv.organization_id
       and e.source = 'invoice_purchase'
       and e.source_id = p_id::text
       and e.created_at = now()
     order by e.id desc
     limit 1;

    if v_entry is not null then
      select coalesce(jsonb_agg(jsonb_build_object(
               'cuenta', jl.account_code,
               'nombre', c.name,
               'descripcion', jl.description,
               'debito', jl.debit,
               'credito', jl.credit
             ) order by (jl.debit > 0) desc, jl.id), '[]'::jsonb),
             coalesce(sum(jl.debit), 0),
             coalesce(sum(jl.credit), 0)
        into v_lineas, v_debitos, v_creditos
        from journal_lines jl
        left join chart_of_accounts c on c.organization_id = v_inv.organization_id and c.account_code = jl.account_code
       where jl.journal_entry_id = v_entry;
    end if;

    select f.reason, f.detail into v_motivo, v_detalle
      from journal_entry_failures f
     where f.organization_id = v_inv.organization_id
       and f.source = 'invoice_purchase'
       and f.source_id = p_id::text
       and f.created_at = now()
     order by f.id desc
     limit 1;

    raise exception using errcode = 'P0001', message = c_marca;
  exception
    when others then
      if sqlerrm <> c_marca then
        v_error := sqlerrm;
      end if;
  end;

  if v_error is not null then
    return jsonb_build_object('ok', false, 'motivo', 'error', 'detalle', v_error);
  end if;

  return jsonb_build_object(
    'ok', v_entry is not null,
    'motivo', case when v_entry is null then coalesce(v_motivo, 'sin_asiento') end,
    'aviso', case when v_entry is not null then v_motivo end,
    'detalle', v_detalle,
    'lineas', v_lineas,
    'debitos', v_debitos,
    'creditos', v_creditos,
    'cuadra', v_entry is not null and round(v_debitos, 2) = round(v_creditos, 2)
  );
end;
$$;

revoke all on function public.fn_factura_compra_asiento_previo(uuid) from public, anon;
grant execute on function public.fn_factura_compra_asiento_previo(uuid) to authenticated, service_role;
