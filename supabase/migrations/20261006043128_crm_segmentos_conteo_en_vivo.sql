-- ============================================================================
-- CRM › Segmentos: conteo en vivo en el SERVIDOR (Figma CRM 1384:825677
-- «Constructor — conteo en vivo» y 1388:1979 «conteo no disponible»).
-- Aplicada por MCP el 2026-10-06. Reensayo previo como authenticated (admin de la
-- org 125): 8/8 filtros maliciosos (campo fuera de la lista blanca o con SQL,
-- operador con SQL, número/fecha/booleano con SQL, salto de línea, tipo de grupos)
-- → 22023; comillas, punto y coma y comentario en valores → 0 coincidencias sin
-- error; «%» literal y «correo O teléfono» = conteo directo; otra organización →
-- 42501; anon y public sin EXECUTE; alta con fn_alta_organizacion OK: ENSAYO_OK.
--
-- ENSAYO 2026-10-06 — resultado literal en «Resultado del ensayo», abajo.
--
-- Problema: el constructor de segmentos contaba en el NAVEGADOR
-- (`SegmentosService.previewFilter`: PostgREST con el cliente del navegador),
-- solo con reglas Y, y con tres campos que `customers` no tiene (`country`,
-- `last_interaction_at`, `is_active`: la consulta fallaba y el conteo daba 0).
-- Tampoco había desglose por canal ni límite de tiempo.
--
-- `crm_segment_preview(p_org, p_filter, p_muestra)`:
--   - Filtro: `{"grupos": [[regla, …], …]}` — Y dentro de cada grupo, O entre
--     grupos (Figma «Todos estos» / «O todos estos»). Regla:
--     `{"field", "operator", "value"}` con campos y operadores de una LISTA
--     BLANCA (columnas reales de `customers`, verificadas por MCP el
--     2026-10-06); los valores van con `%L` y los comodines de LIKE escapados.
--     Fechas: días de la zona de la organización. Hasta 5 grupos × 10 reglas.
--   - Devuelve base, coincidencias, muestra de 3 y el desglose por canal con
--     `fn_can_contact` (la ÚNICA puerta de consentimiento; regla dura 7):
--     teléfono (voz, utilidad), no se pueden llamar, correo y WhatsApp
--     (marketing, exige opt-in). `fn_can_contact` cuesta ~0,35 ms por llamada
--     (medido por MCP como `authenticated`): el desglose es EXACTO hasta 1.000
--     coincidencias; por encima se ESTIMA con 400 coincidencias (orden por id,
--     uuid aleatorio) y sale `estimado: true` para que la interfaz ponga «≈».
--     Si el conteo ya tardó más de 3 s, no hay desglose (`null`).
--   - Tiempo: un `SET statement_timeout` en la función no corta la sentencia
--     en curso (el temporizador se arma al empezar la sentencia de nivel
--     superior); el tope real es el de la ruta (5 s, responde 504
--     `conteo_tardio`) y el del rol `authenticated`.
--   - Alcance: permiso `crm.customers.view`, miembro activo, sucursal del
--     cliente con `app_branch_access` —evaluada UNA vez por sucursal de la
--     organización (fila a fila costaba ~0,3 ms × cliente × consulta)—, sin
--     clientes fusionados (`status='merged'`).
-- Solo lectura (STABLE). Sin columnas ni tablas nuevas.
--
-- Resultado del ensayo (2026-10-06; bloque DO con este cuerpo, como
-- `authenticated` —administrador de la org 2, 18.063 clientes, y de la org
-- 125, 3.964— y comprobando `anon`; termina en raise y todo se revierte;
-- después `pg_proc` confirma 0 funciones con ese nombre). Mensaje literal:
--   ENSAYO_OK crm_segment_preview: T1 sin reglas: base=18063 coinciden=18063
--   desglose={"sobre": 400, "correo": 18063, "estimado": true, "telefono": 0,
--   "whatsapp": 0, "no_llamar": 0} muestra=3 (173 ms) | T2 con correo=18062 =
--   conteo directo | T3 correo O teléfono=18063 = conteo directo | T4 campo
--   country → 22023 filtro_invalido | T5 comilla, paréntesis, punto y coma y
--   comentario en el valor → 0 coincidencias, sin error | T6 entre fechas y «%»
--   literal → 0 | T7 org de 3964 clientes: desglose teléfono=3964 no_llamar=0
--   correo=466 whatsapp=0 estimado=true sobre=400 (477 ms) | T7b 1778
--   coincidencias → desglose exacto=true | T8 no miembro → 42501 | T9 anon sin
--   EXECUTE
-- Lectura: en T7b la etiqueta del ensayo dice «exacto» pero imprime el campo
-- `estimado` (= true): con 1.778 coincidencias (> 1.000) el desglose se estima,
-- que es lo esperado. El primer diseño evaluaba `app_branch_access` fila a
-- fila y no terminaba en 60 s con 18.063 clientes; por eso las sucursales se
-- resuelven una vez.
-- ============================================================================

create or replace function public.crm_segment_preview(
  p_org integer,
  p_filter jsonb,
  p_muestra integer default 3
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_tz text;
  v_grupos jsonb;
  v_grupo jsonb;
  v_regla jsonb;
  v_sql_grupos text[] := array[]::text[];
  v_sql_reglas text[];
  v_campo text;
  v_op text;
  v_val jsonb;
  v_txt text;
  v_tipo text;
  v_col text;
  v_cond text;
  v_where text;
  v_base bigint;
  v_n bigint;
  v_desglose jsonb;
  v_muestra jsonb;
  v_todos boolean := auth.uid() is null;
  v_ramas integer[];
  v_inicio timestamptz := clock_timestamp();
  v_base_sql text;
  v_estimado boolean := false;
  v_tomadas bigint;
  -- Lista blanca: campo → tipo. Solo columnas reales de public.customers.
  c_campos constant jsonb := '{
    "full_name":"texto","first_name":"texto","last_name":"texto","email":"texto","phone":"texto",
    "city":"texto","company_name":"texto","lifecycle_stage":"texto","lead_source":"texto",
    "customer_type":"texto","icp_band":"texto","current_software":"texto",
    "created_at":"fecha","last_contact_at":"fecha",
    "health_score":"numero","lead_score":"numero","branches_count":"numero",
    "tags":"lista","do_not_call":"booleano"
  }'::jsonb;
begin
  perform public.fn_crm_exigir_permiso(p_org, array['crm.customers.view']);
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'sin_sesion' using errcode = '42501';
  end if;
  if auth.uid() is not null and not exists (
    select 1 from public.organization_members m
     where m.organization_id = p_org and m.user_id = auth.uid() and m.is_active
  ) then
    raise exception 'sin_permiso' using errcode = '42501';
  end if;

  v_grupos := coalesce(p_filter->'grupos', '[]'::jsonb);
  if jsonb_typeof(v_grupos) <> 'array' or jsonb_array_length(v_grupos) > 5 then
    raise exception 'filtro_invalido' using errcode = '22023';
  end if;
  select coalesce(timezone, 'America/Bogota') into v_tz from public.organizations where id = p_org;

  for v_grupo in select * from jsonb_array_elements(v_grupos) loop
    if jsonb_typeof(v_grupo) <> 'array' or jsonb_array_length(v_grupo) > 10 then
      raise exception 'filtro_invalido' using errcode = '22023';
    end if;
    v_sql_reglas := array[]::text[];
    for v_regla in select * from jsonb_array_elements(v_grupo) loop
      v_campo := v_regla->>'field';
      v_op := v_regla->>'operator';
      v_val := v_regla->'value';
      v_tipo := c_campos->>v_campo;
      if v_tipo is null or v_op is null then
        raise exception 'filtro_invalido' using errcode = '22023';
      end if;
      v_col := format('c.%I', v_campo);
      v_txt := case when jsonb_typeof(v_val) = 'string' then v_val #>> '{}' else v_val::text end;
      v_cond := case
        when v_op = 'is_empty' and v_tipo = 'texto' then format('coalesce(btrim(%s), '''') = ''''', v_col)
        when v_op = 'is_not_empty' and v_tipo = 'texto' then format('coalesce(btrim(%s), '''') <> ''''', v_col)
        when v_op = 'is_empty' and v_tipo = 'lista' then format('coalesce(cardinality(%s), 0) = 0', v_col)
        when v_op = 'is_not_empty' and v_tipo = 'lista' then format('coalesce(cardinality(%s), 0) > 0', v_col)
        when v_op = 'is_empty' then format('%s is null', v_col)
        when v_op = 'is_not_empty' then format('%s is not null', v_col)
        when v_tipo = 'texto' and v_op = 'equals' then format('lower(%s) = lower(%L)', v_col, v_txt)
        when v_tipo = 'texto' and v_op = 'not_equals' then format('lower(coalesce(%s, '''')) <> lower(%L)', v_col, v_txt)
        when v_tipo = 'texto' and v_op in ('contains', 'not_contains', 'starts_with', 'ends_with') then format(
          '%s %s ilike %L',
          case when v_op = 'not_contains' then format('coalesce(%s, '''')', v_col) else v_col end,
          case when v_op = 'not_contains' then 'not' else '' end,
          case v_op when 'starts_with' then '' else '%' end
            || replace(replace(replace(coalesce(v_txt, ''), '\', '\\'), '%', '\%'), '_', '\_')
            || case v_op when 'ends_with' then '' else '%' end)
        when v_tipo = 'lista' and v_op = 'contains' then format('%L = any(coalesce(%s, array[]::text[]))', v_txt, v_col)
        when v_tipo = 'lista' and v_op = 'not_contains' then format('not (%L = any(coalesce(%s, array[]::text[])))', v_txt, v_col)
        when v_tipo = 'booleano' and v_op = 'equals' and v_txt in ('true', 'false') then format('coalesce(%s, false) = %s', v_col, v_txt)
        when v_tipo = 'numero' and v_op in ('equals', 'greater_than', 'less_than') and v_txt ~ '^-?\d+(\.\d+)?$' then format(
          '%s %s %s', v_col, case v_op when 'equals' then '=' when 'greater_than' then '>' else '<' end, v_txt)
        when v_tipo = 'fecha' and v_op in ('equals', 'greater_than', 'less_than') and v_txt ~ '^\d{4}-\d{2}-\d{2}$' then format(
          '(%s at time zone %L)::date %s %L::date', v_col, v_tz, case v_op when 'equals' then '=' when 'greater_than' then '>' else '<' end, v_txt)
        when v_tipo = 'fecha' and v_op = 'between' and jsonb_typeof(v_val) = 'array'
             and (v_val->>0) ~ '^\d{4}-\d{2}-\d{2}$' and (v_val->>1) ~ '^\d{4}-\d{2}-\d{2}$' then format(
          '(%s at time zone %L)::date between %L::date and %L::date', v_col, v_tz, v_val->>0, v_val->>1)
        else null
      end;
      if v_cond is null then
        raise exception 'filtro_invalido' using errcode = '22023';
      end if;
      v_sql_reglas := v_sql_reglas || ('(' || v_cond || ')');
    end loop;
    if cardinality(v_sql_reglas) > 0 then
      v_sql_grupos := v_sql_grupos || ('(' || array_to_string(v_sql_reglas, ' and ') || ')');
    end if;
  end loop;
  v_where := case when cardinality(v_sql_grupos) = 0 then 'true' else array_to_string(v_sql_grupos, ' or ') end;

  -- Sucursales visibles, UNA vez (misma regla que app_branch_access fila a fila;
  -- un cliente sin sucursal siempre es visible, como en app_branch_access(NULL)).
  v_ramas := array(select b.id from public.branches b where b.organization_id = p_org and (v_todos or public.app_branch_access(b.id)));
  v_base_sql := 'from public.customers c where c.organization_id = $1 and coalesce(c.status, '''') <> ''merged'' '
    || 'and (c.branch_id is null or c.branch_id = any($2)) ';

  execute 'select count(*) ' || v_base_sql using p_org, v_ramas into v_base;
  execute format('select count(*) %s and (%s)', v_base_sql, v_where) using p_org, v_ramas into v_n;
  execute format(
    'select coalesce(jsonb_agg(m), ''[]''::jsonb) from (select c.id, c.full_name as nombre, c.company_name as empresa %s and (%s) '
    || 'order by c.created_at desc, c.id limit $3) m', v_base_sql, v_where)
    using p_org, v_ramas, least(greatest(coalesce(p_muestra, 3), 0), 10) into v_muestra;

  if v_n > 0 and clock_timestamp() - v_inicio < interval '3 seconds' then
    v_estimado := v_n > 1000;
    execute format(
      'select count(*), jsonb_build_object('
      || '''telefono'', count(*) filter (where coalesce(btrim(c.phone), '''') <> '''' and public.fn_can_contact($1, c.id, ''voice'', ''utility'')), '
      || '''no_llamar'', count(*) filter (where coalesce(btrim(c.phone), '''') <> '''' and not public.fn_can_contact($1, c.id, ''voice'', ''utility'')), '
      || '''correo'', count(*) filter (where coalesce(btrim(c.email), '''') <> '''' and public.fn_can_contact($1, c.id, ''email'', ''marketing'')), '
      || '''whatsapp'', count(*) filter (where coalesce(btrim(c.phone), '''') <> '''' and public.fn_can_contact($1, c.id, ''whatsapp'', ''marketing''))) '
      || 'from (select c.id, c.phone, c.email %s and (%s) order by c.id limit $3) c', v_base_sql, v_where)
      using p_org, v_ramas, case when v_estimado then 400 else 1000 end into v_tomadas, v_desglose;
    if v_estimado and v_tomadas > 0 then
      v_desglose := jsonb_build_object(
        'telefono', round((v_desglose->>'telefono')::numeric * v_n / v_tomadas),
        'no_llamar', round((v_desglose->>'no_llamar')::numeric * v_n / v_tomadas),
        'correo', round((v_desglose->>'correo')::numeric * v_n / v_tomadas),
        'whatsapp', round((v_desglose->>'whatsapp')::numeric * v_n / v_tomadas));
    end if;
    v_desglose := v_desglose || jsonb_build_object('estimado', v_estimado, 'sobre', v_tomadas);
  end if;

  return jsonb_build_object(
    'base', v_base,
    'coinciden', v_n,
    'desglose', v_desglose,
    'muestra', v_muestra,
    'calculado_en', clock_timestamp()
  );
end;
$function$;

revoke all on function public.crm_segment_preview(integer, jsonb, integer) from public, anon;
grant execute on function public.crm_segment_preview(integer, jsonb, integer) to authenticated, service_role;

comment on function public.crm_segment_preview(integer, jsonb, integer) is
  'CRM › Segmentos: conteo en vivo de un filtro {grupos: [[regla]]} (Y dentro, O entre grupos) con lista blanca de campos de customers, muestra y desglose por canal con fn_can_contact (exacto hasta 1.000 coincidencias, estimado con 400 por encima). Solo lectura.';
