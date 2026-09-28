-- PREPARADA, NO APLICADA. Desplegar primero TODOS los escritores server-store.
-- Proyecto: jgmgphmzusbluqhuqihj. Aplicación exclusivamente por MCP.
-- Guía: docs/ia-chat/GO-ASSISTANT-ACTIONS-SERVER-ONLY.md
-- No cambia filas, políticas RLS, grants SELECT ni permisos de service_role.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- Además de DML, TRUNCATE permite eliminar datos sin políticas por fila.
-- REFERENCES/TRIGGER tampoco son necesarios para clientes de la Data API.
revoke insert, update, delete, truncate, references, trigger
  on table public.ai_agent_actions from public, anon, authenticated;

-- Defensa explícita frente a grants por columna presentes al desplegar.
-- SELECT por columna se conserva. Sin CASCADE: dependencias inesperadas abortan.
do $migration$
declare
  columns_sql text;
begin
  select string_agg(format('%I', attname), ', ' order by attnum)
    into columns_sql
    from pg_attribute
   where attrelid = 'public.ai_agent_actions'::regclass
     and attnum > 0 and not attisdropped;
  if columns_sql is null then
    raise exception 'ai_agent_actions no tiene columnas; revisar esquema';
  end if;
  execute format(
    'REVOKE INSERT (%1$s), UPDATE (%1$s), REFERENCES (%1$s) ON TABLE public.ai_agent_actions FROM PUBLIC, anon, authenticated',
    columns_sql
  );
end;
$migration$;

-- Fallar atómicamente si persiste una concesión indirecta o cambia el esquema.
do $verify$
declare
  client_role text;
  privilege_name text;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.ai_agent_actions'::regclass) then
    raise exception 'RLS debe permanecer activo en ai_agent_actions';
  end if;
  foreach client_role in array array['anon', 'authenticated'] loop
    foreach privilege_name in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege(client_role, 'public.ai_agent_actions', privilege_name) then
        raise exception 'Permiso de tabla restante: % %', client_role, privilege_name;
      end if;
    end loop;
    foreach privilege_name in array array['INSERT', 'UPDATE', 'REFERENCES'] loop
      if has_any_column_privilege(client_role, 'public.ai_agent_actions', privilege_name) then
        raise exception 'Permiso de columna restante: % %', client_role, privilege_name;
      end if;
    end loop;
    if not has_table_privilege(client_role, 'public.ai_agent_actions', 'SELECT') then
      raise exception 'Se debe conservar SELECT para % (sujeto a RLS)', client_role;
    end if;
  end loop;
  foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if not has_table_privilege('service_role', 'public.ai_agent_actions', privilege_name) then
      raise exception 'Falta permiso % del almacén de servidor', privilege_name;
    end if;
  end loop;
end;
$verify$;
commit;
