-- Reversión de 20261104033000_revocar_anon_g1_sin_uso.sql: devuelve exactamente los EXECUTE leídos el 2026-11-04.

grant execute on function
  public.fn_cuenta_ingresos_diversos(integer,integer)
to public;

grant execute on function
  public.update_stage_safe(uuid,text,numeric,text,text)
to anon;

grant execute on function
  public.update_stage_safe(uuid,text,numeric,text,text),
  public.fn_cuenta_ingresos_diversos(integer,integer)
to authenticated;
