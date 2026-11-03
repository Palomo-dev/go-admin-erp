-- En la base restaurada (2026-11-03) organizations.owner_user_id y created_by quedaron
-- NULL en las organizaciones rescatadas: los uuid de usuario del proyecto borrado no
-- existen en el nuevo. El servidor usa organizations.created_by como usuario de las
-- ventas que crea sin sesión (cron reconcile-web-orders, webhooks de pasarela), y
-- fn_confirmar_pedido_web_completo responde USER_REQUIRED: 46 pedidos web PAGADOS de
-- 3 organizaciones se reintentaban cada 5 minutos sin convertirse en venta.
--
-- Se asigna como dueño al administrador activo más antiguo de cada organización
-- (rol 2 «Admin de organización»; si no hay, rol 1). Solo se llenan valores NULL.
-- Ensayo (ENSAYO_OK): 26 organizaciones actualizadas, 0 quedan sin dueño.
-- Rollback: supabase/rollbacks/20261103233648_organizaciones_restauradas_con_dueno_rollback.sql
with cand as (
  select distinct on (o.id) o.id as org, m.user_id
    from public.organizations o
    join public.organization_members m
      on m.organization_id = o.id and m.is_active and m.role_id in (1, 2)
   where o.owner_user_id is null or o.created_by is null
   order by o.id, (m.role_id = 2) desc, m.created_at, m.id
)
update public.organizations o
   set owner_user_id = coalesce(o.owner_user_id, c.user_id),
       created_by    = coalesce(o.created_by, c.user_id)
  from cand c
 where c.org = o.id;
