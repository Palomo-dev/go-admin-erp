-- Rollback de 20261025134150: quita la función y el permiso (no toca pedidos ni pagos ya marcados).
drop function if exists public.fn_marcar_pedido_web_pagado(uuid, text, text, text);
delete from public.role_permissions
 where permission_id in (select id from public.permissions where code = 'pos.pedidos_web.marcar_pagado');
delete from public.job_position_permissions
 where permission_id in (select id from public.permissions where code = 'pos.pedidos_web.marcar_pagado');
delete from public.permissions where code = 'pos.pedidos_web.marcar_pagado';

delete from supabase_migrations.schema_migrations where version = '20261025134150';
