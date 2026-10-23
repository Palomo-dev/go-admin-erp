-- Validador nuevo y nombres oficiales.
-- El validador deja pasar un cambio de nombre cuando el padre no se toca,
-- así no hace falta apagar el disparador (eso tomaría candado exclusivo).
-- Reversión: supabase/rollbacks/20261023120020_puc_nombres_rollback.sql

set lock_timeout = '8s';
set statement_timeout = '40s';

-- El disparador busca hijas por parent_code. Sin este índice, un update
-- masivo relee la tabla entera por cada fila.
create index if not exists chart_of_accounts_org_parent_idx
  on public.chart_of_accounts (organization_id, parent_code);

create or replace function public.fn_puc_validar_cuenta()
returns trigger
language plpgsql
set search_path to public, pg_temp
as $fn$
declare
  v_largo integer;
  v_prefijo integer;
begin
  -- Un plan viejo puede tener el padre mal colgado. Renombrar o desactivar
  -- no revalida ese padre. Cambiar el padre o el código sí pasa por la regla.
  if tg_op = 'UPDATE'
     and new.account_code = old.account_code
     and new.parent_code is not distinct from old.parent_code then
    if new.account_code ~ '^[0-9]+$' and length(new.account_code) in (1, 2) then
      new.es_movimiento := false;
    elsif new.es_movimiento is true and exists (
      select 1
      from public.chart_of_accounts
      where organization_id = new.organization_id
        and parent_code = new.account_code
    ) then
      new.es_movimiento := false;
    end if;
    return new;
  end if;

  if new.account_code !~ '^[0-9]+$' or left(new.account_code, 1) !~ '^[1-9]$' then
    if tg_op = 'UPDATE' and new.account_code = old.account_code then
      if new.parent_code is not null and position(new.parent_code in new.account_code) <> 1 then
        raise exception 'padre_invalido: el código % no empieza por el padre %', new.account_code, new.parent_code;
      end if;
      return new;
    end if;
    raise exception 'codigo_puc_invalido: % no es un código del PUC', new.account_code;
  end if;

  v_largo := length(new.account_code);
  if v_largo not in (1, 2, 4, 6, 8) and not (v_largo >= 10 and v_largo % 2 = 0) then
    raise exception 'codigo_puc_invalido: % no tiene la longitud de un nivel del PUC', new.account_code;
  end if;

  if v_largo = 1 then
    if new.parent_code is not null then
      raise exception 'padre_invalido: la clase % no lleva cuenta padre', new.account_code;
    end if;
  elsif new.parent_code is not null then
    v_prefijo := case
      when v_largo = 2 then 1
      when v_largo = 4 then 2
      when v_largo = 6 then 4
      when v_largo = 8 then 6
      else v_largo - 2
    end;
    if new.parent_code is distinct from left(new.account_code, v_prefijo) then
      raise exception 'padre_invalido: el padre de % es %, no %',
        new.account_code, left(new.account_code, v_prefijo), new.parent_code;
    end if;
  end if;

  if tg_op = 'INSERT' and v_largo > 1 then
    v_prefijo := case
      when v_largo = 2 then 1
      when v_largo = 4 then 2
      when v_largo = 6 then 4
      when v_largo = 8 then 6
      else v_largo - 2
    end;
    if not exists (
      select 1
      from public.chart_of_accounts
      where organization_id = new.organization_id
        and account_code = left(new.account_code, v_prefijo)
    ) then
      raise exception 'prefijo_ausente: el prefijo % de % no existe en la organización',
        left(new.account_code, v_prefijo), new.account_code;
    end if;
  end if;

  if v_largo in (1, 2) then
    new.es_movimiento := false;
  elsif tg_op = 'INSERT' and new.es_movimiento is null then
    new.es_movimiento := true;
  end if;

  if exists (
    select 1
    from public.chart_of_accounts
    where organization_id = new.organization_id
      and parent_code = new.account_code
  ) then
    new.es_movimiento := false;
  end if;

  if tg_op = 'INSERT' and new.parent_code is not null then
    update public.chart_of_accounts
       set es_movimiento = false,
           updated_at = now()
     where organization_id = new.organization_id
       and account_code = new.parent_code
       and es_movimiento is true;
  end if;

  return new;
end;
$fn$;


-- Nombres del decreto, solo donde no hay líneas.
-- Un solo recorrido de journal_lines: el NOT EXISTS por fila
-- releía el libro de cada organización.
-- Un grupo no se llama corriente.

create temporary table tmp_puc_con_lineas on commit drop as
select jl.organization_id, jl.account_code
from public.journal_lines jl
where jl.account_code in (
  '11', '12', '15', '21', '22', '1504', '1524', '2205', '2605',
  '3205', '3705', '4205', '5205', '5305', '5405', '5905', '6205'
)
group by jl.organization_id, jl.account_code;

update public.chart_of_accounts c
set name = v.nombre
from (values
  ('11', 'Disponible'),
  ('12', 'Inversiones'),
  ('15', 'Propiedades, planta y equipo'),
  ('21', 'Obligaciones financieras'),
  ('22', 'Proveedores'),
  ('1504', 'Terrenos'),
  ('1524', 'Equipo de oficina'),
  ('2205', 'Proveedores nacionales'),
  ('2605', 'Para costos y gastos'),
  ('3205', 'Prima en colocación de acciones, cuotas o partes de interés social'),
  ('3705', 'Utilidades o excedentes acumulados'),
  ('4205', 'Otras ventas'),
  ('5205', 'Gastos de personal'),
  ('5305', 'Financieros'),
  ('5405', 'Impuesto de renta y complementarios'),
  ('5905', 'Ganancias y pérdidas'),
  ('6205', 'De mercancías')
) as v(codigo, nombre)
where c.account_code = v.codigo
  and c.name is distinct from v.nombre
  and not exists (
    select 1
    from tmp_puc_con_lineas l
    where l.organization_id = c.organization_id
      and l.account_code = c.account_code
  );

update public.chart_of_accounts c
set presentacion_niif = public.fn_puc_presentacion_defecto(c.account_code)
where c.presentacion_niif is null
  and public.fn_puc_presentacion_defecto(c.account_code) is not null;

update public.puc_plantilla p
set presentacion_niif = public.fn_puc_presentacion_defecto(p.codigo)
where p.presentacion_niif is null
  and public.fn_puc_presentacion_defecto(p.codigo) is not null;
