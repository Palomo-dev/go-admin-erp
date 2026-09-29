-- Inventario B2 · 1/3 — Esquema de ajustes y ajuste por conteo
-- docs/implementacion/INVENTARIO-PLAN.md §1.3, §2 F4 y §5.3 (bloque B2); decisiones P3, P4 y P5.
--
-- Un ajuste es un documento con tres modos (Figma 586:312944 y 975:186644):
--   * conteo  → `adjustment_items.quantity` es lo CONTADO; la diferencia es contado − sistema.
--   * entrada → `quantity` es lo que entra.
--   * salida  → `quantity` es lo que sale (P5: bloquea si deja la fila en negativo).
-- Los 140 ajustes existentes los escribió la pantalla anterior con semántica de
-- conteo (`quantity` = cantidad final), así que se marcan `conteo`.
--
-- Columnas nuevas (todas NULL-ables o con default; nada se borra ni cambia de tipo):
--   inventory_adjustments: code (AJ-0001, único por organización), mode, counted_at
--     (fecha del conteo), posted_at/posted_by, cancelled_at/cancelled_by/cancel_reason
--     (descartar con motivo en vez de borrar) y apply_key (clave de idempotencia).
--   adjustment_items: system_qty («sistema al contar», congelado al aplicar),
--     difference y applied_cost (costo con que se valoró la diferencia).
-- `status` admite además 'cancelled' (se amplía el CHECK; ningún valor anterior deja de valer).
--
-- Relleno de los históricos aplicados: difference = lo que movió el kardex del
-- ajuste para ese producto y lote, system_qty = quantity − difference y
-- applied_cost = costo medio de esos movimientos. Los borradores se rellenan al
-- guardarlos de nuevo (fn_ajuste_guardar).
--
-- Disparadores:
--   * trg_ajuste_antes_insertar: código, modo y fecha del conteo por defecto.
--     Un ajuste que nace aplicado (GO Assistant, `assistant_create_adjustment`)
--     toma el modo de su tipo (gain → entrada, loss → salida).
--   * trg_ajuste_proteger / trg_ajuste_item_proteger: un ajuste aplicado o
--     descartado no se edita ni se borra (tampoco sus renglones). Excepciones: el
--     borrado en cascada de la organización o la sucursal, y los renglones que el
--     GO Assistant inserta en la misma transacción en que crea su ajuste aplicado.

-- ── Columnas ────────────────────────────────────────────────────────────────
alter table public.inventory_adjustments
  add column if not exists code text,
  add column if not exists mode text,
  add column if not exists counted_at timestamptz,
  add column if not exists posted_at timestamptz,
  add column if not exists posted_by uuid references auth.users(id) on delete set null,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references auth.users(id) on delete set null,
  add column if not exists cancel_reason text,
  add column if not exists apply_key text;

alter table public.adjustment_items
  add column if not exists system_qty numeric,
  add column if not exists difference numeric,
  add column if not exists applied_cost numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inventory_adjustments_mode_check'
                   and conrelid = 'public.inventory_adjustments'::regclass) then
    alter table public.inventory_adjustments
      add constraint inventory_adjustments_mode_check
      check (mode is null or mode in ('entrada', 'salida', 'conteo'));
  end if;
  -- Se amplía: draft/posted siguen valiendo y se añade cancelled.
  if exists (select 1 from pg_constraint where conname = 'inventory_adjustments_status_check'
               and conrelid = 'public.inventory_adjustments'::regclass
               and pg_get_constraintdef(oid) not like '%cancelled%') then
    alter table public.inventory_adjustments drop constraint inventory_adjustments_status_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'inventory_adjustments_status_check'
                   and conrelid = 'public.inventory_adjustments'::regclass) then
    alter table public.inventory_adjustments
      add constraint inventory_adjustments_status_check
      check (status = any (array['draft'::text, 'posted'::text, 'cancelled'::text]));
  end if;
end $$;

comment on column public.inventory_adjustments.code is 'Número legible AJ-0001 (único por organización). Lo pone trg_ajuste_antes_insertar.';
comment on column public.inventory_adjustments.mode is 'conteo: quantity es lo contado · entrada/salida: quantity es lo que entra o sale (B2).';
comment on column public.inventory_adjustments.counted_at is 'Fecha y hora del conteo (la del documento).';
comment on column public.inventory_adjustments.apply_key is 'Clave de idempotencia con que se aplicó (fn_ajuste_aplicar).';
comment on column public.adjustment_items.system_qty is 'Existencia de la fila (producto, sucursal, lote) al aplicar: «sistema al contar». En un borrador, la que había al guardarlo.';
comment on column public.adjustment_items.difference is 'Lo que el ajuste movió (+ entra, − sale). En un borrador, la estimada al guardar.';
comment on column public.adjustment_items.applied_cost is 'Costo unitario con que se valoró la diferencia (el del movimiento del kardex).';

-- ── Relleno de los históricos (antes de los disparadores de protección) ──────
update public.inventory_adjustments
   set code = 'AJ-' || lpad(id::text, 4, '0')
 where code is null;

update public.inventory_adjustments set mode = 'conteo' where mode is null;
update public.inventory_adjustments set counted_at = created_at where counted_at is null;
update public.inventory_adjustments set posted_at = coalesce(updated_at, created_at)
 where status = 'posted' and posted_at is null;

update public.adjustment_items ai
   set difference = m.neto,
       system_qty = ai.quantity - m.neto,
       applied_cost = m.costo
  from (
    select i.id,
           coalesce(sum(case when sm.direction = 'in' then sm.qty else -sm.qty end), 0) as neto,
           case when coalesce(sum(sm.qty), 0) > 0
                then round(sum(sm.qty * coalesce(sm.unit_cost, 0)) / sum(sm.qty), 2) end as costo
      from public.adjustment_items i
      join public.inventory_adjustments ia on ia.id = i.inventory_adjustment_id
      left join public.stock_movements sm
        on sm.source = 'adjustment'
       and sm.source_id = ia.id::text
       and sm.organization_id = ia.organization_id
       and sm.product_id = i.product_id
       and sm.lot_id is not distinct from i.lot_id
     where ia.status = 'posted'
       and i.difference is null
     group by i.id
  ) m
 where m.id = ai.id;

-- ── Índices ─────────────────────────────────────────────────────────────────
create unique index if not exists inventory_adjustments_org_code_key
  on public.inventory_adjustments (organization_id, code);
create index if not exists idx_inventory_adjustments_org_fecha
  on public.inventory_adjustments (organization_id, created_at desc);
create index if not exists idx_adjustment_items_ajuste
  on public.adjustment_items (inventory_adjustment_id);
create index if not exists idx_stock_movements_ajuste
  on public.stock_movements (organization_id, source_id) where source = 'adjustment';

-- ── Disparadores ────────────────────────────────────────────────────────────
create or replace function public.fn_ajuste_int_antes_insertar()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if new.code is null then
    new.code := 'AJ-' || lpad(new.id::text, 4, '0');
  end if;
  if new.mode is null then
    new.mode := case
      when new.status = 'posted' and new.type = 'gain' then 'entrada'
      when new.status = 'posted' and new.type = 'loss' then 'salida'
      else 'conteo'
    end;
  end if;
  if new.counted_at is null then
    new.counted_at := coalesce(new.created_at, now());
  end if;
  if new.status = 'posted' and new.posted_at is null then
    new.posted_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ajuste_antes_insertar on public.inventory_adjustments;
create trigger trg_ajuste_antes_insertar
  before insert on public.inventory_adjustments
  for each row execute function public.fn_ajuste_int_antes_insertar();

create or replace function public.fn_ajuste_int_proteger()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Borrado en cascada (organización o sucursal): lo dispara otra acción, no un usuario.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  if old.status is distinct from 'draft'
     and coalesce(current_setting('app.inv_ajustes_mantenimiento', true), '') <> 'on' then
    raise exception 'ajuste_cerrado' using errcode = '55000',
      detail = 'Un ajuste aplicado o descartado no se modifica ni se borra: haz un ajuste nuevo.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_ajuste_proteger on public.inventory_adjustments;
create trigger trg_ajuste_proteger
  before update or delete on public.inventory_adjustments
  for each row execute function public.fn_ajuste_int_proteger();

create or replace function public.fn_ajuste_int_item_proteger()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
declare
  v_ajuste integer := case when tg_op = 'DELETE' then old.inventory_adjustment_id else new.inventory_adjustment_id end;
  v_padre record;
begin
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old; -- cascada desde el ajuste, la sucursal o la organización
  end if;
  if coalesce(current_setting('app.inv_ajustes_mantenimiento', true), '') = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  select ia.status, ia.created_at into v_padre from public.inventory_adjustments ia where ia.id = v_ajuste;
  if tg_op = 'UPDATE' and new.inventory_adjustment_id is distinct from old.inventory_adjustment_id then
    raise exception 'ajuste_cerrado' using errcode = '55000';
  end if;
  if v_padre.status is distinct from 'draft' then
    -- El GO Assistant crea su ajuste ya aplicado y luego inserta los renglones,
    -- en la misma transacción (created_at = now()).
    if tg_op = 'INSERT' and v_padre.status = 'posted' and v_padre.created_at = now() then
      return new;
    end if;
    raise exception 'ajuste_cerrado' using errcode = '55000',
      detail = 'Los renglones de un ajuste aplicado o descartado no se modifican.';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_ajuste_item_proteger on public.adjustment_items;
create trigger trg_ajuste_item_proteger
  before insert or update or delete on public.adjustment_items
  for each row execute function public.fn_ajuste_int_item_proteger();

revoke all on function public.fn_ajuste_int_antes_insertar() from public, anon, authenticated;
revoke all on function public.fn_ajuste_int_proteger() from public, anon, authenticated;
revoke all on function public.fn_ajuste_int_item_proteger() from public, anon, authenticated;
