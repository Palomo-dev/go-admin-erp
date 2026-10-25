-- P1 (25-oct-2026): cuando una cuenta pasa a es_movimiento = false (título) y está en configuracion_contable,
-- la configuración se mueve a su auxiliar; si no hay un auxiliar claro, se rechaza el cambio con un mensaje.
-- - Inventario (1405*, 1435*): auxiliar 143501xx de la sede (o de la sede principal si es de la organización).
-- - Otras cuentas: su ÚNICO auxiliar de movimiento. Si tiene 0 o varios, se avisa y no se deja cambiar.
-- No toca datos al aplicar: solo actúa en futuras actualizaciones del plan.
-- Rollback: supabase/rollbacks/20261025130400_p1_cuenta_titulo_configurada_rollback.sql

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
begin
  if new.es_movimiento is distinct from false or old.es_movimiento is not distinct from false then
    return new;
  end if;

  for cfg in
    select cc.id, cc.clave, cc.branch_id, cc.account_code
      from public.configuracion_contable cc
     where cc.organization_id = new.organization_id
       and cc.account_code = new.account_code
     for update
  loop
    v_destino := null;

    if cfg.account_code in ('1405', '1435') or cfg.account_code like '1405%' or cfg.account_code like '1435%' then
      v_destino := public.fn_inventario_auxiliar_1435(new.organization_id, cfg.branch_id);
    else
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
      raise exception 'La cuenta % (%) está configurada en «%»%. Antes de volverla de título, crea un auxiliar de movimiento y elígelo en Finanzas > Configuración contable.',
        new.account_code, coalesce(new.name, ''), cfg.clave,
        case when cfg.branch_id is null then '' else ' de la sede ' || cfg.branch_id end
        using errcode = '23514',
              hint = case when coalesce(array_length(v_hijos, 1), 0) > 1
                then 'Tiene varios auxiliares: ' || array_to_string(v_hijos[1:5], ', ')
                else 'No tiene auxiliares de movimiento' end;
    end if;

    update public.configuracion_contable
       set account_code = v_destino
     where id = cfg.id;

    raise notice 'Configuración contable «%» movida de % a % (la cuenta pasó a ser de título)',
      cfg.clave, new.account_code, v_destino;
  end loop;

  return new;
end;
$function$;

drop trigger if exists trg_chart_cuenta_titulo_configurada on public.chart_of_accounts;
create trigger trg_chart_cuenta_titulo_configurada
  after update of es_movimiento on public.chart_of_accounts
  for each row
  when (new.es_movimiento is false and old.es_movimiento is distinct from false)
  execute function public.fn_chart_cuenta_titulo_configurada();
