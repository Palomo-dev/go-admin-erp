-- Inventario B4 · Trazabilidad: recepciones viejas con origen `purchase`.
--
-- El núcleo (fn_inv_documentos) lee el origen `purchase` como factura de
-- compra (uuid). Los movimientos anteriores a F-38 escribían `purchase` con el
-- id numérico de la orden de compra: la trazabilidad de un lote no encontraba
-- su recepción (lote de la org 2: «recibido en OC-28» salía vacío). Aquí, y
-- solo para ese caso, se pregunta al núcleo por la orden de compra. Solo lectura.

create or replace function public.fn_trazabilidad_int_doc_movimiento(p_org integer, p_source text, p_source_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v jsonb;
begin
  if p_source is null or p_source_id is null then
    return null;
  end if;
  v := public.fn_documento_de_movimiento(
         p_org,
         case when p_source = 'purchase' and p_source_id ~ '^\d{1,9}$' then 'purchase_order' else p_source end,
         p_source_id, null);
  if v is null or (v->>'numero' is null and v->>'ruta' is null) then
    return null;
  end if;
  return v;
end;
$$;

revoke all on function public.fn_trazabilidad_int_doc_movimiento(integer, text, text) from public, anon, authenticated;
