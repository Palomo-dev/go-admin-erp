-- Rollback de 20261103233648: vuelve a NULL el dueño de las 26 organizaciones que la
-- migración completó (ids registrados al aplicarla). OJO: con NULL, las ventas sin
-- sesión (cron de conciliación, webhooks) vuelven a fallar con USER_REQUIRED.
update public.organizations
   set owner_user_id = null, created_by = null
 where id in (1, 113, 120, 131, 135, 137, 138, 139, 140, 145, 197, 198, 333, 335, 337,
              338, 339, 340, 341, 342, 345, 346, 347, 348, 349, 358);
