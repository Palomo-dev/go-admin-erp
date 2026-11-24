-- Reversión de 20261124200000_promociones_v2_volumen_segmento_marca.
-- ADVERTENCIA: borra los escalones (promotion_tiers), el registro de usos por cliente
-- (promotion_customer_uses) y las columnas nuevas con sus datos. No los restaura.
-- Antes de volver a poner el CHECK de promotion_type sin 'volume_tiers', las promociones de ese
-- tipo se desactivan y pasan a 'percentage' con descuento 0 (si no, el CHECK no se puede crear).

set lock_timeout = '10s';

-- pos_checkout_v1: quita la línea añadida (reemplazo textual inverso).
do $$
declare
  v_def text := pg_get_functiondef('public.pos_checkout_v1(jsonb)'::regprocedure);
  v_linea text := chr(10) || '      perform public.register_promotion_customer_use(v_org, v_promos, v_customer);';
begin
  if position(v_linea in v_def) > 0 then
    execute replace(v_def, v_linea, '');
  end if;
end $$;

drop function if exists public.register_promotion_customer_use(integer, uuid[], uuid);
drop table if exists public.promotion_customer_uses;

do $$
begin
  if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime'
              and schemaname = 'public' and tablename = 'promotion_tiers') then
    alter publication supabase_realtime drop table public.promotion_tiers;
  end if;
end $$;
drop table if exists public.promotion_tiers;
drop function if exists public.fn_promotion_tiers_misma_org();

drop trigger if exists trg_promotions_segmento_misma_org on public.promotions;
drop function if exists public.fn_promotions_segmento_misma_org();

alter table public.promotion_rules drop constraint if exists promotion_rules_tier_group_check;
alter table public.promotion_rules drop column if exists tier_group;
alter table public.promotion_rules drop column if exists brand;

alter table public.promotions drop constraint if exists promotions_usage_limit_per_customer_check;
alter table public.promotions drop column if exists usage_limit_per_customer;
drop index if exists public.promotions_customer_segment_idx;
alter table public.promotions drop column if exists customer_segment_id;
alter table public.promotions drop constraint if exists promotions_tiers_count_mode_check;
alter table public.promotions drop column if exists tiers_count_mode;

update public.promotions set promotion_type = 'percentage', discount_value = 0, is_active = false
 where promotion_type = 'volume_tiers';
alter table public.promotions drop constraint if exists promotions_promotion_type_check;
alter table public.promotions add constraint promotions_promotion_type_check
  check (promotion_type = any (array['percentage'::text, 'fixed_amount'::text, 'buy_x_get_y'::text,
                                     'bundle'::text, 'free_shipping'::text]));
