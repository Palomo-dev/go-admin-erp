-- Topes de campaña: 120 por día, 40 por hora y 5 a la vez.
-- El default de las columnas era 50 / 20 / 3. Las filas ya creadas se igualan
-- a esos números. El tope horario del agente es el techo compartido con la
-- campaña: si queda por debajo de 40, la cola no llega a 40 por hora.

alter table public.voice_agent_campaigns
  alter column max_calls_per_day set default 120,
  alter column max_calls_per_hour set default 40,
  alter column max_concurrent set default 5;

update public.voice_agent_campaigns
   set max_calls_per_day = 120,
       max_calls_per_hour = 40,
       max_concurrent = 5
 where max_calls_per_day is distinct from 120
    or max_calls_per_hour is distinct from 40
    or max_concurrent is distinct from 5;

update public.voice_agents
   set max_calls_per_hour = 40
 where max_calls_per_hour < 40;
