-- GO Assistant F0 — corrección del tester (fallo 8).
--
-- La política SELECT dejaba a CUALQUIER miembro de la organización leer los
-- `args` y el `preview` de las propuestas de sus compañeros. La API responde 403
-- gracias a la comprobación explícita de `user_id`, así que solo era explotable
-- con el cliente Supabase desde el navegador — pero `args` puede llevar datos de
-- clientes (nombre, documento, teléfono) y no hay razón para que un compañero
-- los vea.
--
-- La UPDATE ya estaba bien restringida al autor. Se alinea la SELECT: autor, o
-- administrador de la organización, que es quien tiene que poder auditar
-- "¿quién creó esta factura y con qué se lo pidió a la IA?" (§9.5).

drop policy if exists "Members can view agent actions of their organization" on public.ai_agent_actions;

create policy "Authors and org admins can view agent actions"
  on public.ai_agent_actions for select
  using (
    organization_id in (
      select om.organization_id from public.organization_members om
      where om.user_id = auth.uid() and om.is_active = true
    )
    and (
      user_id = auth.uid()
      or organization_id in (
        select om.organization_id from public.organization_members om
        where om.user_id = auth.uid() and om.is_active = true
          and (om.is_super_admin = true or om.role_id in (1, 2))
      )
    )
  );