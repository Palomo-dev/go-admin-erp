-- Rollback de 20261023000355_promociones_realtime.
-- Saca las tablas de la publicación y devuelve la identidad de réplica.
-- El comentario de la columna vuelve al texto anterior. No hay datos que restaurar.

do $$
begin
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'promotions'
  ) then
    alter publication supabase_realtime drop table public.promotions;
  end if;
  if exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'promotion_rules'
  ) then
    alter publication supabase_realtime drop table public.promotion_rules;
  end if;
end $$;

alter table public.promotions replica identity default;
alter table public.promotion_rules replica identity default;

comment on column public.promotions.repeat_every_quantity is
  'Repite el descuento por cada grupo de N unidades (porcentaje y monto fijo). NULL = una sola vez.';
