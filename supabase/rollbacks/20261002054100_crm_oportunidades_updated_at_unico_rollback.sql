-- PROPUESTA NO APLICADA. Revierte solamente la eliminación del trigger duplicado.
-- No restaura ni altera datos: la propuesta no cambia filas ni funciones.
do $reversion$
declare
  v_def text;
begin
  perform set_config('lock_timeout', '5s', true);
  perform set_config('statement_timeout', '10s', true);
  lock table public.opportunities in share row exclusive mode;

  if md5(pg_get_functiondef('public.update_modified_column()'::regprocedure)) <> '0d7439fcff0c14e89cf7b37764e3cfea' then
    raise exception 'La función heredada cambió; revisar antes de revertir' using errcode = '55000';
  end if;
  select pg_get_triggerdef(t.oid) into v_def
  from pg_trigger t
  where t.tgrelid = 'public.opportunities'::regclass
    and t.tgname = 'set_opportunities_timestamp' and not t.tgisinternal;
  if v_def is null then
    create trigger set_opportunities_timestamp before update on public.opportunities
      for each row execute function public.update_modified_column();
  elsif v_def <> 'CREATE TRIGGER set_opportunities_timestamp BEFORE UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION update_modified_column()' then
    raise exception 'El trigger heredado cambió; no se reemplaza' using errcode = '55000';
  end if;
end;
$reversion$;
