-- GO-sec (2026-09-28) — `payment_methods` es el catálogo GLOBAL de métodos de
-- pago: una organización solo modifica SU vínculo (`organization_payment_methods`).
--
-- Verificado en la base viva antes de aplicar:
--   * Las políticas de INSERT/UPDATE/DELETE de payment_methods (rol public)
--     dejaban a cualquier miembro —sin permiso de rol— insertar filas
--     is_system = false, y renombrar o BORRAR cualquier fila is_system = false
--     cuyo código estuviera vinculado a alguna de sus organizaciones. «wompi»
--     es is_system = false y está vinculado a 61 organizaciones: borrarlo
--     arrastraba (ON DELETE CASCADE) los vínculos de las otras 60.
--   * La pantalla «Métodos de pago» borraba la fila global al eliminar y la
--     renombraba al editar un código no manual.
--   * Medido: 29 filas; en todas updated_at = created_at, pero la tabla no tiene
--     disparador de updated_at ni auditoría, así que un renombrado no deja
--     rastro. 5 filas las crearon miembros desde la pantalla (agosto de 2026):
--     3 vinculadas a una sola organización (org 132) y 2 huérfanas (sin
--     vínculo: se borró el vínculo y la política ya no dejó borrar la global).
--     Los nombres de las filas del sistema coinciden con su siembra.
--
-- Después de esta migración:
--   * Escribir payment_methods: solo administradores de la plataforma
--     (fn_is_platform_admin) o service role.
--   * Crear un método personalizado: RPC fn_metodo_pago_personalizado_crear, con
--     permiso billing_management resuelto en la base; crea el código global (si
--     no existe) y el vínculo de la organización en una transacción.
--   * Nombre visible propio y «requiere referencia» propio de la organización:
--     organization_payment_methods.settings.display_name / .requires_reference.

-- 1. RLS de payment_methods: fuera las escrituras de miembros.
drop policy if exists payment_methods_insert_policy on public.payment_methods;
drop policy if exists payment_methods_update_policy on public.payment_methods;
drop policy if exists payment_methods_delete_policy on public.payment_methods;

drop policy if exists payment_methods_escritura_plataforma on public.payment_methods;
create policy payment_methods_escritura_plataforma on public.payment_methods
  for all to authenticated
  using ((select public.fn_is_platform_admin()))
  with check ((select public.fn_is_platform_admin()));

revoke insert, update, delete, truncate on table public.payment_methods from anon;

-- 2. Alta de un método personalizado de la organización.
create or replace function public.fn_metodo_pago_personalizado_crear(
  p_organization_id integer,
  p_code text,
  p_name text,
  p_requires_reference boolean default false
)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_codigo text := btrim(coalesce(p_code, ''));
  v_nombre text := btrim(coalesce(p_name, ''));
begin
  perform public.fn_finanzas_exigir_permiso(p_organization_id, array['billing_management']);

  if v_codigo !~ '^[A-Za-z0-9_-]{2,40}$' then
    raise exception 'codigo_invalido' using errcode = '22023';
  end if;
  if length(v_nombre) < 2 or length(v_nombre) > 80 then
    raise exception 'nombre_invalido' using errcode = '22023';
  end if;
  -- El código es global: no se reutiliza ni se pisa uno ajeno.
  if exists (select 1 from public.payment_methods pm where lower(pm.code) = lower(v_codigo)) then
    raise exception 'codigo_existe' using errcode = '23505';
  end if;

  insert into public.payment_methods (code, name, requires_reference, is_active, is_system)
  values (v_codigo, v_nombre, coalesce(p_requires_reference, false), true, false);

  insert into public.organization_payment_methods (organization_id, payment_method_code, is_active, settings)
  values (p_organization_id, v_codigo, true,
          jsonb_build_object('display_name', v_nombre, 'requires_reference', coalesce(p_requires_reference, false)))
  on conflict (organization_id, payment_method_code) do nothing;

  return v_codigo;
end;
$function$;

revoke all on function public.fn_metodo_pago_personalizado_crear(integer, text, text, boolean) from public, anon;
grant execute on function public.fn_metodo_pago_personalizado_crear(integer, text, text, boolean) to authenticated, service_role;
