/**
 * Lógica de `CaptureBanner` (Figma 759:444768). Sin React.
 *
 * `web_capture_lead` guarda el cliente pero, si la organización no tiene
 * pipeline `pipeline_type='sales'`, responde `crm_warning=no_sales_pipeline`
 * y el lead queda «sin colocar». El conteo lo da el servidor (M1b,
 * `crm_leads_sin_colocar`); aquí solo se decide qué pintar.
 */
export type EstadoCaptureBanner = 'oculto' | 'cargando' | 'error' | 'visible';

export function estadoCaptureBanner(opciones: { cantidad: number | null | undefined; cargando?: boolean; error?: string | null }): EstadoCaptureBanner {
  if (opciones.cargando) return 'cargando';
  if (opciones.error) return 'error';
  const n = opciones.cantidad ?? 0;
  return Number.isFinite(n) && n > 0 ? 'visible' : 'oculto';
}

/** Chip de la tabla de Leads que aplica «Ver los N leads». */
export const FILTRO_SIN_COLOCAR = 'sin_colocar' as const;
