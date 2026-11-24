-- Rollback de 20261123213000_logistica_codigo_entrega_configurable: el código vuelve a pedirse siempre.
create or replace function public.fn_shipments_marcar_codigo_requerido()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.delivery_code_required := (new.fulfillment_mode = 'own' and coalesce(new.cod_amount, 0) > 0);
  return new;
end;
$$;
revoke execute on function public.fn_shipments_marcar_codigo_requerido() from public, anon, authenticated;

drop function if exists public.fn_logistica_pide_codigo_entrega(integer);

comment on column public.shipments.delivery_code_required is
  'Lo calcula trg_shipments_codigo_requerido: contraentrega propia (cod_amount > 0 y fulfillment_mode = own).';
