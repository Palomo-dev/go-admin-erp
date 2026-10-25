-- Rollback de 134010: borra SOLO las cuentas que creó (bitácora) y que no tienen líneas ni referencias.
-- Correr DESPUÉS de los rollbacks de 134060 y 134020 (si se aplicaron).
delete from public.chart_of_accounts c
 using public.p1_puc_bitacora b
 where b.migracion = '134010' and b.objeto = 'cuenta'
   and c.organization_id = b.organization_id and c.account_code = b.clave
   and not exists (select 1 from public.journal_lines l where l.organization_id = c.organization_id and l.account_code = c.account_code)
   and not exists (select 1 from public.configuracion_contable cc where cc.organization_id = c.organization_id and cc.account_code = c.account_code)
   and not exists (select 1 from public.chart_of_accounts h where h.organization_id = c.organization_id and h.parent_code = c.account_code
                     and not exists (select 1 from public.p1_puc_bitacora b2 where b2.migracion = '134010' and b2.organization_id = h.organization_id and b2.clave = h.account_code));
-- (repetir el delete una vez más para los padres 370505/613505/429595 que quedan sin hijos tras el primer pase)
delete from public.p1_puc_bitacora b where b.migracion = '134010'
   and not exists (select 1 from public.chart_of_accounts c where c.organization_id = b.organization_id and c.account_code = b.clave);
-- drop table public.p1_puc_bitacora;  -- solo cuando 134020/134060 también estén revertidas
