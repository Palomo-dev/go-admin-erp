-- Revierte 20261023100258_motivos_devolucion_reales.
--
-- Quita el disparador de organizaciones nuevas y deja
-- fn_create_default_return_reasons como estaba: ocho códigos, sin
-- security definer y con execute para anon, authenticated y service_role.
-- Ese grant a anon es el estado anterior; esta reversión lo devuelve.
--
-- Luego borra únicamente los seis códigos sembrados, y solo si ninguna
-- devolución los referencia (returns.reason_id o return_lines.reason_id).
-- Si alguno está en uso, aborta sin borrar: hay que desvincular esas
-- filas antes de volver a correr este archivo.
-- No borra los ocho códigos anteriores ni otros motivos de la organización.
-- Un código igual creado después, y todavía sin devoluciones, también se
-- borra: el criterio es el código, no la fecha.
-- Volver a aplicar la migración es idempotente (on conflict do nothing).

drop trigger if exists tr_zzz_motivos_devolucion on public.organizations;

drop function if exists public.trg_fn_sembrar_motivos_devolucion();

create or replace function public.fn_create_default_return_reasons(p_org_id integer)
returns void
language plpgsql
as $function$
BEGIN
    INSERT INTO return_reasons (organization_id, code, name, description, requires_photo, affects_inventory, display_order)
    VALUES
        (p_org_id, 'DEFECT', 'Producto defectuoso', 'El producto presenta fallas de fabricación', true, false, 1),
        (p_org_id, 'SIZE', 'Talla/tamaño incorrecto', 'No corresponde a la talla o tamaño esperado', false, true, 2),
        (p_org_id, 'REGRET', 'Arrepentimiento', 'El cliente cambió de opinión', false, true, 3),
        (p_org_id, 'DAMAGED', 'Dañado en transporte', 'Producto dañado durante el envío', true, false, 4),
        (p_org_id, 'WRONG', 'Producto incorrecto', 'Se envió un producto diferente al solicitado', false, true, 5),
        (p_org_id, 'QUALITY', 'No cumple expectativas', 'La calidad no es la esperada', false, true, 6),
        (p_org_id, 'EXPIRED', 'Producto vencido', 'El producto está vencido o próximo a vencer', true, false, 7),
        (p_org_id, 'OTHER', 'Otro motivo', 'Motivo no especificado', false, true, 99)
    ON CONFLICT (organization_id, code) DO NOTHING;
END;
$function$;

comment on function public.fn_create_default_return_reasons(integer) is
  'Crea catálogo de motivos de devolución por defecto para una organización';

grant all on function public.fn_create_default_return_reasons(integer) to anon, authenticated, service_role;

do $borrar$
declare
  v_usados integer;
begin
  select count(*)::integer into v_usados
  from public.return_reasons rr
  where rr.code in ('DEFECTUOSO', 'INCORRECTO', 'DANADO', 'NO_CONFORME', 'GARANTIA', 'OTRO')
    and (
      exists (select 1 from public.returns r where r.reason_id = rr.id)
      or exists (select 1 from public.return_lines rl where rl.reason_id = rr.id)
    );

  if v_usados > 0 then
    raise exception 'motivos_en_uso: % filas referenciadas; no se borran', v_usados;
  end if;

  delete from public.return_reasons
   where code in ('DEFECTUOSO', 'INCORRECTO', 'DANADO', 'NO_CONFORME', 'GARANTIA', 'OTRO');
end;
$borrar$;
