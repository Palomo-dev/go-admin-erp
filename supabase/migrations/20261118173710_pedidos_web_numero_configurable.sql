-- Número del pedido web configurable por organización
-- (Configuración › POS › Número de pedido; código en src/lib/pos/pedidosWeb/numeroPedido.ts).
--
-- 1. web_order_number_settings: formato ('actual' = WO-{org}-{ts36}-{rand4} de siempre,
--    'consecutivo' = PREFIJO-0001, 'corto' = PREFIJO-XXXXXX), prefijo y el siguiente consecutivo.
--    Sin fila = formato actual. El prefijo es de UNA organización (índice único): el número es la
--    referencia que viaja a la pasarela y las organizaciones 333 y 339 comparten comercio Wompi.
-- 2. Índice único global de web_orders.order_number (verificado 2026-11-18: 5.862 pedidos, 0
--    repetidos ni globalmente ni por organización). Implica el único por organización y deja que
--    la tienda y el ERP encuentren el pedido de un cobro por su número sin ambigüedad.
-- 3. siguiente_numero_pedido_web(org): consecutivo atómico (bloquea la fila de ajustes) o código
--    corto libre; null en el formato actual (quien llama usa el de siempre). Solo service_role.
--
-- Aditiva: no renombra pedidos existentes ni toca datos. Reversión:
-- supabase/rollbacks/20261118173710_pedidos_web_numero_configurable_rollback.sql

create table if not exists public.web_order_number_settings (
  organization_id integer primary key references public.organizations(id) on delete cascade,
  format text not null default 'actual',
  prefix text,
  next_number bigint not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint web_order_number_settings_format_check check (format in ('actual', 'consecutivo', 'corto')),
  constraint web_order_number_settings_next_number_check check (next_number >= 1),
  -- 2–10 caracteres A-Z, 0-9 y guion; sin guion al principio, al final ni doble.
  constraint web_order_number_settings_prefix_forma check (
    prefix is null or (prefix ~ '^[A-Z0-9][A-Z0-9-]{0,8}[A-Z0-9]$' and position('--' in prefix) = 0)
  ),
  -- Primer tramo reservado: ya significa otra cosa en las referencias de pago (PREFIJOS_RESERVADOS).
  constraint web_order_number_settings_prefix_reservado check (
    prefix is null or split_part(prefix, '-', 1) <> all (array[
      'WO', 'RES', 'MEM', 'TKT', 'PKP', 'INV', 'MESA', 'CQR', 'CHG', 'PAGO', 'POS', 'PMS', 'GO', 'DEL',
      'INST', 'SP', 'TEST', 'WEB', 'COMP', 'VEND'
    ])
  ),
  -- El formato actual no usa prefijo (y así lo libera para otra tienda); los otros lo exigen.
  constraint web_order_number_settings_prefix_segun_formato check ((format = 'actual') = (prefix is null))
);

comment on table public.web_order_number_settings is
  'Formato del número de pedido web por organización. Sin fila = formato actual WO-{org}-{ts36}-{rand4}.';
comment on column public.web_order_number_settings.prefix is
  'Prefijo del número (PREFIJO-0001 o PREFIJO-XXXXXX). Único entre organizaciones.';
comment on column public.web_order_number_settings.next_number is
  'Siguiente consecutivo. Vuelve a 1 al cambiar de prefijo; siguiente_numero_pedido_web salta los ya usados.';

create unique index if not exists web_order_number_settings_prefix_key
  on public.web_order_number_settings (prefix) where prefix is not null;

alter table public.web_order_number_settings enable row level security;

drop policy if exists web_order_number_settings_select on public.web_order_number_settings;
create policy web_order_number_settings_select on public.web_order_number_settings
  for select to authenticated
  using (organization_id in (
    select om.organization_id from public.organization_members om
    where om.user_id = (select auth.uid()) and om.is_active
  ));
-- Escribe solo el servidor (service role) después de validar organización y permiso.

revoke all on public.web_order_number_settings from anon;
grant select on public.web_order_number_settings to authenticated;

create unique index if not exists web_orders_order_number_key on public.web_orders (order_number);

create or replace function public.siguiente_numero_pedido_web(p_organization_id integer)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_formato text;
  v_prefijo text;
  v_n bigint;
  v_numero text;
  v_alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  select s.format, s.prefix, s.next_number
    into v_formato, v_prefijo, v_n
    from public.web_order_number_settings s
   where s.organization_id = p_organization_id
     for update;

  if not found or v_formato = 'actual' or v_prefijo is null then
    return null;
  end if;

  if v_formato = 'consecutivo' then
    loop
      v_numero := v_prefijo || '-' || case when v_n < 10000 then lpad(v_n::text, 4, '0') else v_n::text end;
      exit when not exists (select 1 from public.web_orders w where w.order_number = v_numero);
      v_n := v_n + 1;
    end loop;
    update public.web_order_number_settings
       set next_number = v_n + 1
     where organization_id = p_organization_id;
    return v_numero;
  end if;

  for i in 1..20 loop
    select v_prefijo || '-' || string_agg(substr(v_alfabeto, 1 + floor(random() * 32)::int, 1), '')
      into v_numero
      from generate_series(1, 6);
    if not exists (select 1 from public.web_orders w where w.order_number = v_numero) then
      return v_numero;
    end if;
  end loop;
  raise exception 'No hay código corto libre para la organización %', p_organization_id;
end;
$$;

comment on function public.siguiente_numero_pedido_web(integer) is
  'Siguiente número de pedido web de la organización (consecutivo atómico o código corto). Null = formato actual.';

revoke all on function public.siguiente_numero_pedido_web(integer) from public, anon, authenticated;
grant execute on function public.siguiente_numero_pedido_web(integer) to service_role;
