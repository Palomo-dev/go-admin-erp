-- Seis tablas auxiliares de migraciones en public sin RLS y con permisos para anon/authenticated.
-- Solo las leen funciones SECURITY DEFINER (palabras_de_catalogo, fn_regla_contable_reclasificar).
-- Aplicada por MCP el 2026-11-04. Se activa RLS sin políticas (solo service_role) y se quitan los
-- permisos de anon/authenticated.
do $$
declare t text;
begin
  foreach t in array array[
    'sinonimos_base','regla_contable_aviso','regla_contable_funciones',
                           'puc_consolidacion_cuentas','puc_consolidacion_funciones','puc_consolidacion_plantilla'
  ] loop
    if to_regclass('public.' || quote_ident(t)) is not null then
      execute format('alter table public.%I enable row level security', t);
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
