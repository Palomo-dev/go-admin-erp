-- Reversión de 20261104033100_revocar_anon_g2_solo_sesion.sql: devuelve exactamente los EXECUTE leídos el 2026-11-04.

grant execute on function
  public.check_user_permission(uuid,integer,text),
  public.fn_cuenta_auxiliar_de_titulo(integer,integer,text,numeric,text),
  public.fn_uvt(integer,text)
to public;

grant execute on function
  public.check_user_permission(uuid,integer,text),
  public.fn_uvt(integer,text)
to anon;
