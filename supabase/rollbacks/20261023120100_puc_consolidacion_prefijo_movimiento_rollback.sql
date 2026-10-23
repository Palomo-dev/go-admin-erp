-- Este rollback deshace 20261023120000 y 20261023120100.
-- Es el mismo script que el de 20261023120000: se puede correr una sola vez.
-- Si el periodo del traslado está cerrado, se detiene antes de soltar las funciones.

-- Rollback de 20261023120000_puc_consolidacion_prefijo.sql
--
-- Restaura nombres y parent_code desde puc_consolidacion_cuentas, la plantilla
-- desde puc_consolidacion_plantilla y el cuerpo de las funciones desde
-- puc_consolidacion_funciones. Esas tablas las crea la migración, antes de
-- renombrar y de reemplazar funciones.
--
-- Si ya se aplicó un traslado desde la pantalla, primero se revierte con
-- fn_puc_migracion_revertir (contra-asiento). El periodo de ese asiento tiene
-- que estar abierto; si está cerrado, este script se detiene.
-- Los auxiliares creados por el traslado no se borran: el par traslado y
-- reverso les deja líneas. Su neto vuelve a cero y la cuenta de origen queda
-- activa otra vez.
-- Las filas de journal_reversals con categoria puc_migracion se eliminan para
-- poder devolver el check anterior. Los asientos de reverso siguen en el libro.
--
-- Si la migración no llegó a aplicarse, cada paso es un no-op.

set lock_timeout = '15s';
set statement_timeout = '60s';

do $rb$
declare
  r record;
begin
  if to_regclass('public.puc_migracion_corrida') is not null
     and to_regprocedure('public.fn_puc_migracion_revertir(integer)') is not null then
    for r in
      select distinct organization_id
      from public.puc_migracion_corrida
      where estado = 'aplicado'
    loop
      perform public.fn_puc_migracion_revertir(r.organization_id);
    end loop;
  end if;
end
$rb$;

do $rb$
begin
  if to_regclass('public.puc_consolidacion_cuentas') is null then
    return;
  end if;
  execute 'alter table public.chart_of_accounts disable trigger trg_puc_validar_cuenta';
  update public.chart_of_accounts c
    set parent_code = b.parent_code,
        name = b.name
  from public.puc_consolidacion_cuentas b
  where c.organization_id = b.organization_id
    and c.account_code = b.account_code
    and (c.parent_code is distinct from b.parent_code or c.name is distinct from b.name);
  execute 'alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta';
exception when others then
  execute 'alter table public.chart_of_accounts enable trigger trg_puc_validar_cuenta';
  raise;
end
$rb$;

do $rb$
begin
  if to_regclass('public.puc_consolidacion_plantilla') is null
     or to_regclass('public.puc_plantilla') is null then
    return;
  end if;
  delete from public.puc_plantilla p
  where not exists (
    select 1 from public.puc_consolidacion_plantilla b where b.codigo = p.codigo
  );
  insert into public.puc_plantilla
  select b.*
  from public.puc_consolidacion_plantilla b
  where not exists (
    select 1 from public.puc_plantilla p where p.codigo = b.codigo
  );
  update public.puc_plantilla p
    set nombre = b.nombre,
        tipo = b.tipo,
        padre = b.padre,
        descripcion = b.descripcion,
        naturaleza = b.naturaleza,
        es_movimiento = b.es_movimiento,
        requiere_tercero = b.requiere_tercero,
        requiere_centro_costo = b.requiere_centro_costo,
        centro_costo_modo = b.centro_costo_modo,
        presentacion_niif = b.presentacion_niif
  from public.puc_consolidacion_plantilla b
  where p.codigo = b.codigo;
end
$rb$;

do $rb$
declare
  r record;
begin
  if to_regclass('public.puc_consolidacion_funciones') is null then
    return;
  end if;
  for r in
    select definicion
    from public.puc_consolidacion_funciones
    order by firma
  loop
    execute r.definicion;
  end loop;
end
$rb$;

drop function if exists public.fn_puc_migracion_revertir(integer);
drop function if exists public.fn_puc_migracion_aplicar(integer, uuid);
drop function if exists public.fn_puc_migracion_preview(integer);
drop function if exists public.fn_puc_reclasificaciones(integer);
drop function if exists public.fn_puc_proponer_config(integer, text, text);
drop function if exists public.fn_puc_proponer_lado(integer, text, text, text, text);
drop function if exists public.fn_puc_cuenta_para_asiento(integer, text, text);
drop function if exists public.fn_puc_asegurar_cuenta(integer, text, text, boolean);
drop function if exists public.fn_puc_destino_reclass(integer, text, text);
drop function if exists public.fn_puc_nombres_oficiales();
drop function if exists public.fn_saldos_jerarquicos(integer, timestamptz, timestamptz, integer);
drop function if exists public.fn_cuenta_por_clave(integer, integer, text);
drop function if exists public.fn_puc_ancestros(integer, text);
drop function if exists public.fn_puc_presentacion_defecto(text);
drop function if exists public.fn_puc_codigo_normalizado(text);

delete from public.journal_reversals where categoria = 'puc_migracion';

alter table public.journal_reversals drop constraint if exists journal_reversals_categoria_check;
alter table public.journal_reversals
  add constraint journal_reversals_categoria_check
  check (categoria = any (array[
    'F-48', 'F-45', 'F-49', 'CC-001', 'F-01', 'CC-009', 'F-63', 'manual'
  ]));

drop index if exists public.chart_of_accounts_org_parent_idx;
alter table public.chart_of_accounts drop constraint if exists chart_of_accounts_presentacion_niif_check;
alter table public.chart_of_accounts drop column if exists presentacion_niif;
alter table public.puc_plantilla drop constraint if exists puc_plantilla_presentacion_niif_check;
alter table public.puc_plantilla drop column if exists presentacion_niif;
alter table public.branch_account_mappings drop column if exists legacy_code;

drop table if exists public.puc_migracion_mapa;
drop table if exists public.puc_migracion_corrida;
drop table if exists public.puc_consolidacion_funciones;
drop table if exists public.puc_consolidacion_plantilla;
drop table if exists public.puc_consolidacion_cuentas;
