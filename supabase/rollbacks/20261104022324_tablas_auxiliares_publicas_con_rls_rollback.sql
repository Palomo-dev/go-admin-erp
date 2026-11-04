-- Reversión de 20261104022324_tablas_auxiliares_publicas_con_rls: devuelve las tablas al estado anterior (sin RLS y con todos los permisos
-- para anon/authenticated). OJO: ese estado deja las tablas legibles y vaciables con la clave anon.
do $$
declare t text;
begin
  foreach t in array array[
    'sinonimos_base','regla_contable_aviso','regla_contable_funciones',
                           'puc_consolidacion_cuentas','puc_consolidacion_funciones','puc_consolidacion_plantilla'
  ] loop
    if to_regclass('public.' || quote_ident(t)) is not null then
      execute format('grant all on public.%I to anon, authenticated', t);
      execute format('alter table public.%I disable row level security', t);
    end if;
  end loop;
end $$;
