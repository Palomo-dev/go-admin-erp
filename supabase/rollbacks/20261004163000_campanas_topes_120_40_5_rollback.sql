-- No restaura el tope anterior de cada fila: las campañas no estaban todas en
-- el default (había 5, 50 y 110 al día, entre otros) y el agente tampoco.
-- Solo devuelve el DEFAULT de las columnas de la campaña a 50 / 20 / 3.

alter table public.voice_agent_campaigns
  alter column max_calls_per_day set default 50,
  alter column max_calls_per_hour set default 20,
  alter column max_concurrent set default 3;
