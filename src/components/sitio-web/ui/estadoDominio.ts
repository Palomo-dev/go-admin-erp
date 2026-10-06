/**
 * Estado de un dominio del sitio (Figma B/02). Puro (sin React): lo usan la
 * píldora `DomainStatusBadge` y el servidor (alertas del Resumen), así que el
 * umbral de «vence pronto» vive en un solo lugar.
 */
export type EstadoDominio = 'verificando' | 'activo' | 'mal_configurado' | 'vence_pronto' | 'vencido' | 'pendiente';

/** Días antes del vencimiento en que se avisa «Vence pronto». */
export const DIAS_AVISO_VENCIMIENTO = 30;

/**
 * Estado a partir de `organization_domains.status` (enum `domain_status`:
 * pending, verifying, verified, failed, expired, disabled) y, si se conoce, los
 * días que faltan para vencer (hoy en `metadata.expires_at`; el área de
 * dominios propone la columna `expires_at`). Puro.
 */
export function resolverEstadoDominio(status: string, diasParaVencer?: number | null): EstadoDominio {
  switch (status) {
    case 'verifying':
      return 'verificando';
    case 'failed':
      return 'mal_configurado';
    case 'expired':
      return 'vencido';
    case 'verified':
      if (typeof diasParaVencer === 'number' && Number.isFinite(diasParaVencer)) {
        if (diasParaVencer < 0) return 'vencido';
        if (diasParaVencer <= DIAS_AVISO_VENCIMIENTO) return 'vence_pronto';
      }
      return 'activo';
    default:
      return 'pendiente';
  }
}
