-- Revierte 20261001223153_ventas_b2b_plantilla.sql.
-- Restaura nombre, probabilidad, color, SLA y posición de las cinco etapas
-- que ya tenía el pipeline «Ventas B2B» de la organización 125.
-- Borra Calificado, Discovery, Demo y Negociacion solo si no tienen
-- oportunidades. Si alguna ya tiene, se deja (posición 100 + la suya) y
-- no se pueden recuperar los nombres anteriores de una etapa que el
-- usuario haya vuelto a renombrar después de esta migración.

ALTER TABLE public.stages DISABLE TRIGGER trg_refresh_forecast_stages;

UPDATE public.stages AS s
SET position = 100 + s.position
FROM public.pipelines AS p
WHERE s.pipeline_id = p.id
  AND p.organization_id = 125
  AND p.name = 'Ventas B2B'
  AND s.name IN ('Calificado', 'Discovery', 'Demo', 'Negociacion')
  AND EXISTS (
    SELECT 1 FROM public.opportunities AS o WHERE o.stage_id = s.id
  );

DELETE FROM public.stages AS s
USING public.pipelines AS p
WHERE s.pipeline_id = p.id
  AND p.organization_id = 125
  AND p.name = 'Ventas B2B'
  AND s.name IN ('Calificado', 'Discovery', 'Demo', 'Negociacion')
  AND NOT EXISTS (
    SELECT 1 FROM public.opportunities AS o WHERE o.stage_id = s.id
  );

UPDATE public.stages AS s
SET name = 'Contacto Inicial',
    position = 1,
    probability = 10,
    color = '#60a5fa',
    sla_days = NULL,
    is_won = false,
    is_lost = false
FROM public.pipelines AS p
WHERE s.pipeline_id = p.id
  AND p.organization_id = 125
  AND p.name = 'Ventas B2B'
  AND s.name = 'Lead nuevo';

UPDATE public.stages AS s
SET name = 'Reunión Agendada',
    position = 2,
    probability = 30,
    color = '#a78bfa',
    sla_days = NULL,
    is_won = false,
    is_lost = false
FROM public.pipelines AS p
WHERE s.pipeline_id = p.id
  AND p.organization_id = 125
  AND p.name = 'Ventas B2B'
  AND s.name = 'Contactado';

UPDATE public.stages AS s
SET name = 'Propuesta Enviada',
    position = 3,
    probability = 60,
    color = '#f472b6',
    sla_days = NULL,
    is_won = false,
    is_lost = false
FROM public.pipelines AS p
WHERE s.pipeline_id = p.id
  AND p.organization_id = 125
  AND p.name = 'Ventas B2B'
  AND s.name = 'Propuesta';

UPDATE public.stages AS s
SET name = 'Ganado',
    position = 4,
    probability = 100,
    color = '#22c55e',
    sla_days = NULL,
    is_won = true,
    is_lost = false
FROM public.pipelines AS p
WHERE s.pipeline_id = p.id
  AND p.organization_id = 125
  AND p.name = 'Ventas B2B'
  AND s.name = 'Contrato/pago';

UPDATE public.stages AS s
SET name = 'Perdido',
    position = 5,
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

ALTER TABLE public.stages ENABLE TRIGGER trg_refresh_forecast_stages;

REFRESH MATERIALIZED VIEW public.mv_crm_forecast;
