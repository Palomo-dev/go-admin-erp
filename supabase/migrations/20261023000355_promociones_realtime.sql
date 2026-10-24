-- Aplicada el 2026-10-23 con apply_migration (versión 20261023000355).
--
-- El carrito abierto del POS y la cuenta de una mesa se suscriben a
-- `promotions` (filtro organization_id) y a `promotion_rules` para recalcular
-- sin agregar ítems. Ninguna de las dos estaba en supabase_realtime, así que
-- otro equipo no se enteraba. El filtro por organization_id exige replica
-- identity full: con la identidad por defecto (solo la llave) Postgres no
-- manda esa columna en el WAL y el filtro no entrega filas.
--
-- El comentario de repeat_every_quantity se actualiza: el paquete también
-- la usa. NULL sigue siendo el comportamiento sin repetición. No hay backfill.
--
-- ENSAYO (2026-10-23, execute_sql, begin … rollback):
--   promotions y promotion_rules quedaron replica=full y publicadas=true
--   dentro de la transacción. Al hacer rollback volvieron a quedar fuera.
--
-- Idempotente. Rollback: supabase/rollbacks/20261023000355_promociones_realtime_rollback.sql

set lock_timeout = '10s';

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'promotions'
     ) then
    alter publication supabase_realtime add table public.promotions;
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'promotion_rules'
     ) then
    alter publication supabase_realtime add table public.promotion_rules;
  end if;
end $$;

alter table public.promotions replica identity full;
alter table public.promotion_rules replica identity full;

comment on column public.promotions.repeat_every_quantity is
  'Repite el descuento por cada grupo de N unidades. Porcentaje y paquete sin precio: solo floor(unidades/N)*N unidades. Monto fijo: floor(unidades/N) veces el monto. Paquete con precio: como maximo floor(unidades que entran/N) paquetes completos. NULL = sin repeticion (porcentaje sobre todas las unidades, monto una sola vez, todos los paquetes completos).';
