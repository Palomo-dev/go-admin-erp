-- PROPUESTA NO APLICADA. Ola 5: quitar solo el trigger duplicado de updated_at.
-- Verificado por MCP: ambos cuerpos únicamente hacen NEW.updated_at = now().
-- Sin filas modificadas ni funciones eliminadas. El trigger canónico se conserva.
-- El bloque completo se ejecuta en una transacción; locks y límites son locales.
do $limpieza$
declare
  v_def text;
begin
  perform set_config('lock_timeout', '5s', true);
  perform set_config('statement_timeout', '10s', true);
  lock table public.opportunities in share row exclusive mode;

  if md5(pg_get_functiondef('public.set_updated_at()'::regprocedure)) <> '4d6804d5850641a33867814c9e76a714'
     or md5(pg_get_functiondef('public.update_modified_column()'::regprocedure)) <> '0d7439fcff0c14e89cf7b37764e3cfea' then
    raise exception 'Las funciones de updated_at cambiaron; revisar antes de limpiar' using errcode = '55000';
  end if;

  select pg_get_triggerdef(t.oid) into v_def
  from pg_trigger t
  where t.tgrelid = 'public.opportunities'::regclass
    and t.tgname = 'set_opportunities_updated_at' and not t.tgisinternal;
  if v_def is distinct from 'CREATE TRIGGER set_opportunities_updated_at BEFORE UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION set_updated_at()' then
    raise exception 'El trigger canónico falta o cambió; no se limpia' using errcode = '55000';
  end if;

  select pg_get_triggerdef(t.oid) into v_def
  from pg_trigger t
  where t.tgrelid = 'public.opportunities'::regclass
    and t.tgname = 'set_opportunities_timestamp' and not t.tgisinternal;
  if v_def is not null and v_def <> 'CREATE TRIGGER set_opportunities_timestamp BEFORE UPDATE ON public.opportunities FOR EACH ROW EXECUTE FUNCTION update_modified_column()' then
    raise exception 'El trigger heredado cambió; no se limpia' using errcode = '55000';
  end if;

  drop trigger if exists set_opportunities_timestamp on public.opportunities;
end;
$limpieza$;
