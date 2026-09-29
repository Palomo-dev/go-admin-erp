-- Reversión de 20260929040710_inv_b4_documento_compra_legado.sql: vuelve a la
-- versión de 20260929040700 (el origen `purchase` numérico queda sin documento).

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
  v := public.fn_documento_de_movimiento(p_org, p_source, p_source_id, null);
  if v is null or (v->>'numero' is null and v->>'ruta' is null) then
    return null;
  end if;
  return v;
end;
$$;

revoke all on function public.fn_trazabilidad_int_doc_movimiento(integer, text, text) from public, anon, authenticated;
