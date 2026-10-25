-- Rollback de 130600: restaura reglas y configuración desde la bitácora y la versión viva (25-oct)
-- de fn_cuentas_movimiento_stock. Correr ANTES del rollback de 130500 y DESPUÉS del de 130700.
update public.accounting_rules ar
   set debit_account_code  = case when b.campo = 'debit_account_code'  then b.valor_anterior else ar.debit_account_code end,
       credit_account_code = case when b.campo = 'credit_account_code' then b.valor_anterior else ar.credit_account_code end,
       tax_account_code    = case when b.campo = 'tax_account_code'    then b.valor_anterior else ar.tax_account_code end,
       updated_at = now()
  from public.p1_puc_bitacora b
 where b.migracion = '130600' and b.objeto = 'regla' and ar.id = b.clave::uuid;

-- El validador exige movimiento: restaurar config a cuentas que hoy sean de título fallaría; por eso
-- este rollback va después del de 130700 (los padres vuelven a ser de movimiento).
update public.configuracion_contable cc set account_code = b.valor_anterior
  from public.p1_puc_bitacora b
 where b.migracion = '130600' and b.objeto = 'config' and cc.id = b.clave::bigint;

delete from public.configuracion_contable where organization_id = 149 and clave = 'iva_generado'
   and account_code in ('24080501', '240805')
   and not exists (select 1 from public.p1_puc_bitacora b where b.migracion = '130600' and b.objeto = 'config' and b.organization_id = 149);

delete from public.p1_puc_bitacora where migracion = '130600';

CREATE OR REPLACE FUNCTION public.fn_cuentas_movimiento_stock(p_organization_id integer, p_source text, p_direction text, OUT debito text, OUT credito text, OUT evento text)
 RETURNS record
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_inv text;
  v_cmv text;
  v_faltante text;
  v_tmp text;
  v_type integer;
begin
  perform public.fn_assert_acceso_org(p_organization_id);

  select o.type_id into v_type
  from public.organizations o
  where o.id = p_organization_id;

  select ar.credit_account_code
    into v_inv
  from public.accounting_rules ar
  where ar.organization_id = p_organization_id
    and ar.source_type = 'inventory'
    and ar.event_type = 'adjusted'
    and ar.is_active
  order by ar.priority
  limit 1;
  v_inv := coalesce(nullif(btrim(v_inv), ''), '1405');
  v_cmv := case when v_type in (1, 2) then '6140' else '6135' end;
  v_faltante := coalesce(
    public.fn_cuenta_por_clave(p_organization_id, null, 'faltante_inventario'),
    '519595'
  );

  evento := case
    when p_source = 'initial' then 'opening'
    when p_source in ('sale', 'web_sale', 'mesa_sale', 'invoice_sale', 'web_order', 'folio_item', 'room_consumption') then 'sale'
    when p_source in ('return', 'credit_note', 'invoice_void', 'web_refund', 'credit_note_void', 'folio_item_reversal') then 'return'
    when p_source in ('purchase', 'purchase_order', 'purchase_invoice') then 'purchase'
    when p_source = 'loss' or p_direction = 'out' then 'loss'
    else 'gain'
  end;

  select ar.debit_account_code, ar.credit_account_code
    into debito, credito
  from public.accounting_rules ar
  where ar.organization_id = p_organization_id
    and ar.source_type = 'inventory'
    and ar.event_type = evento
    and ar.is_active
  order by ar.priority
  limit 1;

  if debito is null or credito is null then
    if evento = 'opening' then
      debito := v_inv;
      credito := '3105';
    elsif evento = 'sale' then
      debito := v_cmv;
      credito := v_inv;
    elsif evento = 'return' then
      debito := v_inv;
      credito := v_cmv;
    elsif evento = 'purchase' then
      debito := v_inv;
      credito := '2205';
    elsif evento = 'loss' then
      debito := v_faltante;
      credito := v_inv;
    else
      debito := v_inv;
      credito := '4295';
    end if;
  end if;

  if p_direction = 'out' and evento in ('return', 'opening', 'purchase') then
    v_tmp := debito;
    debito := credito;
    credito := v_tmp;
  end if;

  if p_direction = 'in' and evento is distinct from 'return' and left(credito, 1) = '6' then
    debito := v_inv;
    credito := '4295';
  end if;

  if evento = 'loss' and (left(coalesce(debito, ''), 1) = '6' or debito in ('5150', '6105')) then
    debito := v_faltante;
    if left(coalesce(debito, ''), 1) = '6' then
      debito := '519595';
    end if;
  end if;
end;
$function$;
