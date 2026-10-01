-- Alinea el pipeline «Ventas B2B» de la organización 125 con la plantilla
-- de ventas (PIPELINE_TEMPLATES, key sales). No toca ningún otro pipeline.
--
-- Las oportunidades se quedan en la misma fila de stages: se renombra, no
-- se borra. Contacto Inicial pasa a Lead nuevo (probabilidad 10, igual).
-- Reunión Agendada pasa a Contactado (probabilidad 30 → 20; son 2
-- oportunidades). Propuesta Enviada, sin oportunidades, pasa a Propuesta.
-- Ganado pasa a Contrato/pago y sigue siendo la etapa ganadora. Perdido
-- se queda. Se agregan Calificado, Discovery, Demo y Negociacion.
--
-- trg_refresh_forecast_stages hace REFRESH CONCURRENTLY y no puede correr
-- dentro de la transacción de la migración. Se apaga solo durante el
-- cambio y el pronóstico se refresca una vez al final.

ALTER TABLE public.stages DISABLE TRIGGER trg_refresh_forecast_stages;

UPDATE public.stages AS s
SET name = 'Lead nuevo',
    probability = 10,
    color = '#3b82f6',
    sla_days = 3,
    is_won = false,
    is_lost = false
FROM public.pipelines AS p
WHERE s.pipeline_id = p.id
  AND p.organization_id = 125
  AND p.name = 'Ventas B2B'
  AND s.name = 'Contacto Inicial';

UPDATE public.stages AS s
SET name = 'Contactado',
    probability = 20,
    color = '#6366f1',
    sla_days = 7,
    is_won = false,
    is_lost = false
FROM public.pipelines AS p
WHERE s.pipeline_id = p.id
  AND p.organization_id = 125
  AND p.name = 'Ventas B2B'
  AND s.name = 'Reunión Agendada';

UPDATE public.stages AS s
SET name = 'Propuesta',
    probability = 80,
    color = '#ec4899',
    sla_days = 30,
    is_won = false,
    is_lost = false
FROM public.pipelines AS p
WHERE s.pipeline_id = p.id
  AND p.organization_id = 125
  AND p.name = 'Ventas B2B'
  AND s.name = 'Propuesta Enviada';

UPDATE public.stages AS s
SET name = 'Contrato/pago',
    probability = 100,
    color = '#22c55e',
    sla_days = NULL,
    is_won = true,
    is_lost = false
FROM public.pipelines AS p
WHERE s.pipeline_id = p.id
  AND p.organization_id = 125
  AND p.name = 'Ventas B2B'
  AND s.name = 'Ganado';

UPDATE public.stages AS s
SET name = 'Perdido',
    probability = 0,
    color = '#ef4444',
    sla_days = NULL,
    is_won = false,
    is_lost = true
FROM public.pipelines AS p
WHERE s.pipeline_id = p.id
  AND p.organization_id = 125
  AND p.name = 'Ventas B2B'
  AND s.name = 'Perdido';

INSERT INTO public.stages (pipeline_id, name, position, probability, color, sla_days, is_won, is_lost)
SELECT p.id, v.name, v.position, v.probability, v.color, v.sla_days, false, false
FROM public.pipelines AS p
CROSS JOIN (
  VALUES
    ('Calificado'::text, 103, 35, '#8b5cf6'::varchar, 10),
    ('Discovery', 104, 50, '#a855f7', 14),
    ('Demo', 105, 65, '#d946ef', 21),
    ('Negociacion', 107, 90, '#f97316', 45)
) AS v(name, position, probability, color, sla_days)
WHERE p.organization_id = 125
  AND p.name = 'Ventas B2B'
  AND NOT EXISTS (
    SELECT 1
    FROM public.stages AS s
    WHERE s.pipeline_id = p.id
      AND s.name = v.name
  );

WITH ranked AS (
  SELECT s.id,
         row_number() OVER (
           ORDER BY
             CASE
               WHEN s.is_lost THEN 3
               WHEN s.is_won THEN 2
               ELSE 1
             END,
             CASE s.name
               WHEN 'Lead nuevo' THEN 1
               WHEN 'Contactado' THEN 2
               WHEN 'Calificado' THEN 3
               WHEN 'Discovery' THEN 4
               WHEN 'Demo' THEN 5
               WHEN 'Propuesta' THEN 6
               WHEN 'Negociacion' THEN 7
               ELSE 8
             END,
             s.position,
             s.id
         ) AS pos
  FROM public.stages AS s
  JOIN public.pipelines AS p ON p.id = s.pipeline_id
  WHERE p.organization_id = 125
    AND p.name = 'Ventas B2B'
)
UPDATE public.stages AS s
SET position = r.pos
FROM ranked AS r
WHERE s.id = r.id
  AND s.position IS DISTINCT FROM r.pos;

ALTER TABLE public.stages ENABLE TRIGGER trg_refresh_forecast_stages;

REFRESH MATERIALIZED VIEW public.mv_crm_forecast;
