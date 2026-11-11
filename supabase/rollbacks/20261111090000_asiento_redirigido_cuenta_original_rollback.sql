-- Reversión de 20261111090000_asiento_redirigido_cuenta_original.sql.
--
-- Devuelve fn_puc_linea_solo_movimiento a la versión de 20261110210000 (redirige sin nota). La
-- columna journal_lines.cuenta_original se deja: puede guardar el rastro de líneas ya redirigidas y
-- borrarla perdería esa evidencia de auditoría.

create or replace function public.fn_puc_linea_solo_movimiento()
 returns trigger
 language plpgsql
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_org integer;
  v_mov boolean;
  v_destino text;
  v_siguiente text;
  v_mov_destino boolean;
  v_activa boolean;
  v_saltos integer := 0;
begin
  v_org := new.organization_id;
  if v_org is null then
    select organization_id into v_org
    from public.journal_entries
    where id = new.journal_entry_id;
  end if;
  if v_org is null then
    return new;
  end if;

  select es_movimiento into v_mov
  from public.chart_of_accounts
  where organization_id = v_org
    and account_code = new.account_code;

  -- Sin fila en el plan, o con es_movimiento null: no es un rechazo nuevo.
  if v_mov is false then
    -- Si pasó a título al crearle una cuenta debajo en el plan, el asiento va a esa cuenta
    -- (o a la que la sucedió a ella). Así ningún asiento automático cae en la de arriba.
    v_destino := new.account_code;
    while v_saltos < 5 loop
      v_saltos := v_saltos + 1;
      v_siguiente := null;
      select s.sucesora into v_siguiente
        from public.plan_cuentas_sucesoras s
       where s.organization_id = v_org and s.account_code = v_destino;
      exit when v_siguiente is null;
      v_destino := v_siguiente;
      v_mov_destino := null;
      v_activa := null;
      select c.es_movimiento, c.is_active into v_mov_destino, v_activa
        from public.chart_of_accounts c
       where c.organization_id = v_org and c.account_code = v_destino;
      if v_mov_destino is true and v_activa is distinct from false then
        new.account_code := v_destino;
        return new;
      end if;
    end loop;
    raise exception 'cuenta_no_es_de_movimiento: la cuenta % es de título y no recibe asientos', new.account_code;
  end if;
  return new;
end;
$function$;
