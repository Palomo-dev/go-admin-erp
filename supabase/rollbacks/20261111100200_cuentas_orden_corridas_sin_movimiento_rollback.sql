-- Reversión de 20261111100200_cuentas_orden_corridas_sin_movimiento.sql.
--
-- Devuelve, desde public.cuentas_orden_corridas_respaldo, cada subárbol a su código, padre, nombre y updated_at
-- anteriores (pasos en orden inverso: 98←96, 96←95, 88←86, 86←85) y las reglas contables a sus códigos; la
-- configuración contable sigue sola (FK ON UPDATE CASCADE). Después borra la tabla de respaldo.
-- Solo toca organizaciones que están en el respaldo: las creadas con la plantilla nueva conservan 85/86 y 95/96.
-- Si alguna cuenta movida recibió asientos después, el FK de journal_lines detiene la reversión entera (no deja
-- asientos colgando de un código que ya no existe).

do $$
declare
  v_paso integer;
begin
  if to_regclass('public.cuentas_orden_corridas_respaldo') is null then
    raise notice 'sin respaldo: 20261111100200 no se aplicó';
    return;
  end if;

  for v_paso in
    select distinct paso from public.cuentas_orden_corridas_respaldo order by paso desc
  loop
    update public.chart_of_accounts c
       set account_code = r.valor_anterior,
           parent_code = r.parent_anterior,
           name = r.nombre_anterior,
           updated_at = r.updated_at_anterior
      from public.cuentas_orden_corridas_respaldo r
     where r.paso = v_paso
       and r.tabla = 'chart_of_accounts'
       and c.organization_id = r.organization_id
       and c.account_code = r.valor_nuevo;
  end loop;

  update public.accounting_rules a set debit_account_code = r.valor_anterior
    from public.cuentas_orden_corridas_respaldo r
   where r.tabla = 'accounting_rules' and r.columna = 'debit_account_code' and a.id = r.fila_id;
  update public.accounting_rules a set credit_account_code = r.valor_anterior
    from public.cuentas_orden_corridas_respaldo r
   where r.tabla = 'accounting_rules' and r.columna = 'credit_account_code' and a.id = r.fila_id;
  update public.accounting_rules a set tax_account_code = r.valor_anterior
    from public.cuentas_orden_corridas_respaldo r
   where r.tabla = 'accounting_rules' and r.columna = 'tax_account_code' and a.id = r.fila_id;
  update public.accounting_rules a set discount_account_code = r.valor_anterior
    from public.cuentas_orden_corridas_respaldo r
   where r.tabla = 'accounting_rules' and r.columna = 'discount_account_code' and a.id = r.fila_id;
end $$;

drop table if exists public.cuentas_orden_corridas_respaldo;
