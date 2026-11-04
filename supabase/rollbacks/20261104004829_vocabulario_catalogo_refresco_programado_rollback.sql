-- Rollback de 20261104004829: retira el refresco programado (el vocabulario queda con el
-- último refresco; vaciarlo dejaría al chat sin reconocer productos).
select cron.unschedule('org-vocabulario-refresco');
