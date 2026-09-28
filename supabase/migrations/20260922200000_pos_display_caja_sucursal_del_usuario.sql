-- Pantalla del cliente POS, Fase 3 parte C (ronda 2, qa critico 1): el canal
-- Realtime de una terminal deja de estar abierto a TODA la organizacion.
-- Plan: docs/pos-doble-pantalla/PLAN.md §7 y §11.
--
-- El problema. Hasta la parte C la caja no se unia al canal y no salia nada
-- por el; la parte C es justo el cambio que lo pone en vivo. Las politicas
-- pos_display_caja_recibe / pos_display_caja_envia (20260922130000 y
-- 20260922180000) solo exigian «existe una terminal activa con el uuid del
-- topic», y VER esa terminal lo decide pos_terminals_select, que es
-- pertenencia a la organizacion a secas. Resultado: cualquier miembro activo
-- —un cajero de otra sucursal, un auxiliar de bodega— podia (a) leer en vivo
-- el carrito, los totales, el cliente, la fase de cobro y el payload del QR de
-- pago de cualquier terminal activa, y (b) inyectar mensajes `up` VALIDOS con
-- el terminalId correcto (va en el propio topic): display_alive, display_bye,
-- tip_selected y qr_paid_claim, que se le muestra al cajero como «el cliente
-- dice que ya pago».
--
-- El criterio nuevo: al canal de una terminal solo entra quien TRABAJA en esa
-- sucursal, con la excepcion de siempre para la administracion:
--   - membresia ACTIVA en la organizacion de la terminal, y ademas
--   - la sucursal de la terminal esta entre las del usuario (member_branches),
--     O rol Super Admin / Admin de organizacion / Manager (role_id 1, 2, 5),
--     O is_super_admin, O check_user_permission(..., 'admin.full_access').
-- Es el mismo criterio de rol que ya usa pos_terminals_update
-- (20260921150000): por id, nunca por nombre.
--
-- Fail-closed: un miembro sin ninguna sucursal asignada NO entra. Verificado
-- antes de aplicar: de 138 membresias activas, 61 no tienen fila en
-- member_branches y 60 de ellas pasan igual por rol; queda 1 sola afectada.
-- pos_terminals tiene 0 filas, asi que no hay nada que migrar.
--
-- Lo que esto NO cierra, y se deja por escrito: «solo la caja que reclamo la
-- terminal» exigiria un claim de terminal en la sesion o una tabla de reclamo.
-- Con esto, el radio baja de «toda la organizacion» a «la misma sucursal».
--
-- Las politicas de la PANTALLA no cambian: su JWT lleva el claim
-- pos_terminal_id y solo le sirve para su propio topic.
--
-- Verificado en un bloque DO con rollback, como authenticated y con
-- realtime.topic fijado: cajero de la sucursal de la terminal -> true;
-- cajero de otra sucursal -> false; admin -> true; topic malformado -> false
-- (substring NULL -> cast NULL -> EXISTS false, nunca 22P02).
-- Aditiva: solo recrea dos politicas.

drop policy if exists pos_display_caja_recibe on realtime.messages;
create policy pos_display_caja_recibe on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1
        from public.pos_terminals t
        join public.organization_members om
          on om.organization_id = t.organization_id
         and om.user_id = (select auth.uid())
         and om.is_active = true
       where t.is_active
         and t.id = substring((select realtime.topic()) from '^pos-display:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$')::uuid
         and (
           om.role_id in (1, 2, 5)
           or om.is_super_admin = true
           or exists (
                select 1
                  from public.member_branches mb
                 where mb.organization_member_id = om.id
                   and mb.branch_id = t.branch_id)
           or public.check_user_permission((select auth.uid()), t.organization_id, 'admin.full_access')
         )
    )
  );

drop policy if exists pos_display_caja_envia on realtime.messages;
create policy pos_display_caja_envia on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and exists (
      select 1
        from public.pos_terminals t
        join public.organization_members om
          on om.organization_id = t.organization_id
         and om.user_id = (select auth.uid())
         and om.is_active = true
       where t.is_active
         and t.id = substring((select realtime.topic()) from '^pos-display:([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$')::uuid
         and (
           om.role_id in (1, 2, 5)
           or om.is_super_admin = true
           or exists (
                select 1
                  from public.member_branches mb
                 where mb.organization_member_id = om.id
                   and mb.branch_id = t.branch_id)
           or public.check_user_permission((select auth.uid()), t.organization_id, 'admin.full_access')
         )
    )
  );
