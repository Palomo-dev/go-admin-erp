-- Rollback de 20260915110000_drop_execute_sql.sql
-- ADVERTENCIA: recrea execute_sql, que es RCE como postgres.
-- Usar solo si el DROP causa un fallo critico.
-- Tras recrearla, aplicar inmediatamente:
--   revoke execute on function public.execute_sql(text)
--     from public, anon, authenticated;
--   grant execute on function public.execute_sql(text)
--     to postgres, service_role;

create or replace function public.execute_sql(sql_query text)
returns json
language plpgsql
security definer
as $function$
declare
    result json;
begin
    -- Validar que la consulta sea segura (solo SELECT)
    if not (sql_query ilike 'select%' or sql_query ilike 'with%') then
        raise exception 'Solo se permiten consultas SELECT';
    end if;

    -- Ejecutar la consulta y retornar como JSON
    execute 'select json_agg(row_to_json(t)) from (' || sql_query || ') t' into result;

    -- Si no hay resultados, retornar array vacio
    if result is null then
        result := '[]'::json;
    end if;

    return result;
end;
$function$;

-- ACL segura: solo postgres y service_role
revoke execute on function public.execute_sql(text)
  from public, anon, authenticated;
grant execute on function public.execute_sql(text)
  to postgres, service_role;
