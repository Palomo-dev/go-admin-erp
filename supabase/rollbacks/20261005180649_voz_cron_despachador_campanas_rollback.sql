-- Reversión: quita la tarea; las campañas vuelven a llamar solo con «Ejecutar ahora».
select cron.unschedule('voz-campanas-5min');
