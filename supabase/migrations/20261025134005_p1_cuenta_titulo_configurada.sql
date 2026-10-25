-- P1 (25-oct-2026): cuando una cuenta pasa a es_movimiento = false (título) y está en configuracion_contable,
-- la configuración se mueve a su auxiliar.
-- - Inventario (1405*, 1435*): auxiliar 143501xx YA mapeado a la sede (o a la sede principal si es de la organización)
--   en branch_account_mappings. Solo lectura: NO llama a fn_asegurar_auxiliar_1435 (evita recursión, porque esa
--   función inserta en chart_of_accounts y puede volver de título la 1435 si sigue siendo de movimiento).
-- - Otras cuentas (salvo impuestos 24xx, que nunca se adivinan): su ÚNICO auxiliar de movimiento.
-- - Si no hay un destino claro: RAISE NOTICE y la configuración queda como está (la corrige el resolver /
--   Finanzas > Configuración contable). No lanza excepción.
-- Es un CONSTRAINT TRIGGER DEFERRABLE INITIALLY DEFERRED: fn_puc_validar_cuenta vuelve título al padre en el
-- BEFORE INSERT del primer auxiliar (cuando el hijo aún no existe); al diferir, se valida al final de la
-- transacción, cuando el auxiliar ya existe. Solo actúa en UPDATE de es_movimiento a false; relee la fila al
-- disparar por si cambió dentro de la transacción.
-- No toca datos al aplicar: solo actúa en futuras actualizaciones del plan.
-- Rollback: supabase/rollbacks/20261025134005_p1_cuenta_titulo_configurada_rollback.sql

CREATE OR REPLACE FUNCTION public.fn_chart_cuenta_titulo_configurada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  cfg record;
  v_destino text;
  v_hijos text[];
  v_branch integer;
  v_es_mov boolean;
begin
  if tg_op <> 'UPDATE' then
    return null;
  end if;

  -- Estado actual (trigger diferido: la fila pudo cambiar después del UPDATE original)
  select c.es_movimiento into v_es_mov
    from public.chart_of_accounts c
   where c.organization_id = new.organization_id
     and c.account_code = new.account_code;
  if v_es_mov is distinct from false then
    return null;
  end if;

  for cfg in
    select cc.id, cc.clave, cc.branch_id, cc.account_code
      from public.configuracion_contable cc
     where cc.organization_id = new.organization_id
       and cc.account_code = new.account_code
     for update
  loop
    v_destino := null;
    v_hijos := null;

    if cfg.account_code like '1405%' or cfg.account_code like '1435%' then
      v_branch := cfg.branch_id;
      if v_branch is null then
        select b.id into v_branch
          from public.branches b
         where b.organization_id = new.organization_id
           and coalesce(b.is_active, true)
         order by b.is_main desc nulls last, b.id
         limit 1;
      end if;
      select m.sub_account_code into v_destino
        from public.branch_account_mappings m
        join public.chart_of_accounts c
          on c.organization_id = m.organization_id
         and c.account_code = m.sub_account_code
         and c.es_movimiento is true
       where m.organization_id = new.organization_id
         and m.branch_id = v_branch
         and m.base_account_code in ('1435', '1405')
         and m.sub_account_code ~ '^143501[0-9]{2}$'
       order by case when m.base_account_code = '1435' then 0 else 1 end
       limit 1;
    elsif cfg.account_code not like '24%' then  -- impuestos: no se adivina el auxiliar
      select array_agg(c.account_code order by c.account_code) into v_hijos
        from public.chart_of_accounts c
       where c.organization_id = new.organization_id
         and c.account_code like new.account_code || '_%'
         and c.es_movimiento is true
         and c.is_active is distinct from false;
      if coalesce(array_length(v_hijos, 1), 0) = 1 then
        v_destino := v_hijos[1];
      end if;
    end if;

    if v_destino is null or v_destino = new.account_code then
      raise notice 'La cuenta % (%) pasó a título y está configurada en «%»%; no hay un auxiliar claro (%). Elige uno en Finanzas > Configuración contable.',
        new.account_code, coalesce(new.name, ''), cfg.clave,
        case when cfg.branch_id is null then '' else ' de la sede ' || cfg.branch_id end,
        case when cfg.account_code like '24%' then 'impuestos: no se adivina'
             when coalesce(array_length(v_hijos, 1), 0) > 1
               then 'varios auxiliares: ' || array_to_string(v_hijos[1:5], ', ')
             else 'sin auxiliar de movimiento' end;
      continue;
    end if;

    update public.configuracion_contable
       set account_code = v_destino
     where id = cfg.id;

    raise notice 'Configuración contable «%» movida de % a % (la cuenta pasó a ser de título)',
      cfg.clave, new.account_code, v_destino;
  end loop;

  return null;
end;
$function$;

drop trigger if exists trg_chart_cuenta_titulo_configurada on public.chart_of_accounts;
create constraint trigger trg_chart_cuenta_titulo_configurada
  after update of es_movimiento on public.chart_of_accounts
  deferrable initially deferred
  for each row
  when (new.es_movimiento is false and old.es_movimiento is distinct from false)
  execute function public.fn_chart_cuenta_titulo_configurada();
