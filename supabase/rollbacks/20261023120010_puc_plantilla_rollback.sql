-- Devuelve puc_plantilla al respaldo de 20261023120000.
-- No toca chart_of_accounts. Si el respaldo no existe, no hace nada.
-- La reversión completa del conjunto está en
-- 20261023120100_puc_consolidacion_prefijo_movimiento_rollback.sql

set lock_timeout = '8s';
set statement_timeout = '40s';

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
