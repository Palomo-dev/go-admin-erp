-- NO APLICAR.
--
-- Propuesta para crear el grupo 36 y la cuenta 3610 (Pérdida del ejercicio)
-- en las organizaciones que ya tienen 3605 y todavía no tienen 3610.
-- No está en supabase/migrations y no se ejecutó. No reparenta la 3605
-- que hoy cuelga de la clase 3, ni cambia nombres ya guardados.
--
-- El disparador del PUC exige que el padre de una cuenta de 4 dígitos sea
-- el grupo de 2. Por eso primero se inserta 36 (padre 3) y después 3610
-- (padre 36). 98 organizaciones tienen 3605 de movimiento y una sola tiene
-- 3610. Sin 3610, el cierre de un año en pérdida responde
-- faltan_cuentas_cierre. Un año en utilidad cierra contra 3605 aunque
-- 3610 no exista.
--
-- El bloque aborta solo. Hay que borrar el raise exception para correrlo,
-- dentro de una transacción, y revisar el conteo antes de confirmar.

do $propuesta$
begin
  raise exception 'propuesta_no_aplicada';

  insert into public.chart_of_accounts (
    organization_id, account_code, name, type, parent_code, is_active,
    nivel, clase, activa
  )
  select c.organization_id, '36', 'Resultados del ejercicio', 'equity', '3', true,
         'grupo', 3, true
    from public.chart_of_accounts c
   where c.account_code = '3'
     and c.type = 'equity'
     and not exists (
       select 1
         from public.chart_of_accounts g
        where g.organization_id = c.organization_id
          and g.account_code = '36'
     );

  insert into public.chart_of_accounts (
    organization_id, account_code, name, type, parent_code, is_active,
    nivel, clase, activa, es_movimiento
  )
  select c.organization_id, '3610', 'Pérdida del Ejercicio', 'equity', '36', true,
         'cuenta', 3, true, true
    from public.chart_of_accounts c
   where c.account_code = '3605'
     and not exists (
       select 1
         from public.chart_of_accounts p
        where p.organization_id = c.organization_id
          and p.account_code = '3610'
     );
end;
$propuesta$;
