-- Asiento redirigido a la cuenta sucesora: guarda la cuenta original (Contador, 2026-11-10).
--
-- ESTADO: APLICADA el 2026-11-10 por el MCP (registro 20261111030954). md5 de prosrc tras aplicar:
-- 907a7127…, igual a este archivo. Prueba en seco (org 374): 1110 → 111005 y luego 111010; una línea
-- «Factura 123» a 1110 quedó en 111005 con cuenta_original 1110 y descripción «Factura 123 ·
-- Registrado en 111005; venía para 1110»; una sin descripción quedó solo con la nota; la de 1120 sin cambio.
-- Reversión: supabase/rollbacks/20261111090000_asiento_redirigido_cuenta_original_rollback.sql.
-- Depende de 20261110210000 (plan_cuentas_sucesoras y la redirección en fn_puc_linea_solo_movimiento).
--
-- Pedido del Contador: cuando un documento viejo genera un asiento contra la cuenta que pasó a
-- título y el sistema lo registra en la cuenta nueva, el asiento debe guardar una nota con la cuenta
-- original («registrado en 111005; venía para 1110») para poder rastrearlo en una auditoría.
--
-- 1. journal_lines.cuenta_original (text, NULL): la cuenta a la que venía la línea. Columna nueva,
--    NULL-able, sin valor por defecto: no reescribe la tabla ni toca líneas existentes.
-- 2. fn_puc_linea_solo_movimiento: al redirigir, llena cuenta_original y agrega a la descripción
--    «Registrado en <nueva>; venía para <original>». Solo cambia ese caso; el resto queda igual.
--
-- La cuenta sucesora es la PRIMERA que se creó debajo (plan_cuentas_sucesoras). Si después se abre
-- otra (111010), lo redirigido sigue yendo a la primera (111005); la pantalla del plan lo dice.

alter table public.journal_lines add column if not exists cuenta_original text;

comment on column public.journal_lines.cuenta_original is
  'Cuenta a la que venía la línea cuando fn_puc_linea_solo_movimiento la registró en la cuenta sucesora (plan_cuentas_sucesoras). NULL si no hubo redirección.';

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
  v_original text;
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
    v_original := new.account_code;
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
        -- Rastro para auditoría (Contador, 2026-11-10): la línea guarda la cuenta a la que venía
        -- y lo dice en su descripción.
        new.account_code := v_destino;
        new.cuenta_original := coalesce(new.cuenta_original, v_original);
        new.description := left(
          coalesce(nullif(btrim(new.description), '') || ' · ', '')
            || format('Registrado en %s; venía para %s', v_destino, v_original),
          1000
        );
        return new;
      end if;
    end loop;
    raise exception 'cuenta_no_es_de_movimiento: la cuenta % es de título y no recibe asientos', new.account_code;
  end if;
  return new;
end;
$function$;
