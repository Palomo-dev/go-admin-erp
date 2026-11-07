-- Reversión de 20261108030000_nota_debito.sql.
--
-- No revierte datos: las notas débito emitidas mientras la migración estuvo
-- aplicada (invoice_sales.document_type = 'debit_note', sus líneas, su cartera
-- y sus asientos) quedan en la base. Anúlelas antes con fn_nota_debito_anular
-- si hace falta; después de este rollback ya no se pueden pagar ni anular por
-- la aplicación.

-- 4. fn_registrar_pago vuelve a rechazar todo lo que no sea factura.
do $$
declare
  v_firma constant regprocedure :=
    'public.fn_registrar_pago(text,jsonb,text,text,date,text,integer,numeric,numeric,text,text,text,integer)'::regprocedure;
  v_def text := pg_get_functiondef(v_firma);
  v_viejo constant text := $v$if coalesce(v_inv.document_type, 'invoice') <> 'invoice' then raise exception 'documento_invalido'$v$;
  v_nuevo constant text := $v$if coalesce(v_inv.document_type, 'invoice') not in ('invoice', 'debit_note') then raise exception 'documento_invalido'$v$;
  v_veces integer;
begin
  if position(v_nuevo in v_def) = 0 then
    raise notice 'fn_registrar_pago no tenía el cambio de la nota débito';
    return;
  end if;
  v_veces := (length(v_def) - length(replace(v_def, v_nuevo, ''))) / length(v_nuevo);
  if v_veces <> 1 then
    raise exception 'fn_registrar_pago cambió: se esperaba 1 aparición y hay %', v_veces;
  end if;
  execute replace(v_def, v_nuevo, v_viejo);
end;
$$;

-- 3, 2, 1.
drop function if exists public.fn_nota_debito_anular(uuid, text);
drop function if exists public.fn_nota_debito_emitir(uuid, text, jsonb, text, text);
drop function if exists public.fn_nota_debito_codigo_impuesto(text, numeric);
