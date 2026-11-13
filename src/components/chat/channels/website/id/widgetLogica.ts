/**
 * Reglas puras del detalle del chat del sitio web (sin React):
 * `__tests__/widgetLogica.test.ts`.
 */
import type { WidgetPosition } from '@/lib/services/chatChannelsService';

/** «https://www.Tienda.com/x» → «www.tienda.com». */
export function normalizarDominio(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '');
}

export function esDominioValido(dominio: string): boolean {
  if (dominio === 'localhost') return true;
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(dominio);
}

export type ClavePosicion = 'abajoDerecha' | 'abajoIzquierda' | 'arribaDerecha' | 'arribaIzquierda';

export function claveDePosicion(p: Pick<WidgetPosition, 'side' | 'vertical'>): ClavePosicion {
  if (p.vertical === 'top') return p.side === 'left' ? 'arribaIzquierda' : 'arribaDerecha';
  return p.side === 'left' ? 'abajoIzquierda' : 'abajoDerecha';
}

/** Cambia esquina y conserva los márgenes que ya tenía. */
export function posicionDeClave(clave: ClavePosicion, actual: WidgetPosition): WidgetPosition {
  return {
    ...actual,
    side: clave.endsWith('Izquierda') ? 'left' : 'right',
    vertical: clave.startsWith('arriba') ? 'top' : 'bottom',
  };
}

/** % de sesiones desde celular (`device_type` mobile/tablet cuentan como celular). `null` sin sesiones. */
export function porcentajeCelular(dispositivos: Record<string, number>): number | null {
  const total = Object.values(dispositivos).reduce((a, b) => a + b, 0);
  if (!total) return null;
  const celular = Object.entries(dispositivos)
    .filter(([d]) => /mobile|movil|móvil|phone|celular|tablet/i.test(d))
    .reduce((a, [, n]) => a + n, 0);
  return Math.round((celular / total) * 100);
}
