/**
 * Lógica de los logos del catálogo de Conexiones (diseño 85-16). Sin React.
 *
 * - Marcas con símbolo propio (`MARCAS_CON_SIMBOLO`): se dibuja un SVG simple y reconocible.
 * - Marcas «provisionales» (aún sin símbolo aprobado): iniciales en recuadro, fijas por id.
 * - Cualquier id que no esté en ninguna lista (un proveedor nuevo de la base): iniciales del id.
 */

/** Ids de `SERVICIOS` (catalogoConexiones.ts) que tienen símbolo dibujado. */
export const MARCAS_CON_SIMBOLO = [
  'stripe',
  'paypal',
  'whatsapp',
  'instagram_facebook',
  'meta',
  'expedia',
  'mercadopago',
  'airbnb',
  'tripadvisor',
  'google_vacation_rentals',
  'ifood',
  'google_ads',
  'tiktok',
  'sms_llamadas',
  'sendgrid',
  'ubereats',
  'cobros_qr',
  'facturacion_electronica',
  'conectar_banco',
] as const;

export type MarcaConSimbolo = (typeof MARCAS_CON_SIMBOLO)[number];

/** Iniciales aprobadas en Figma para las marcas provisionales. */
export const INICIALES_PROVISIONALES: Readonly<Record<string, string>> = {
  wompi: 'W',
  payu: 'PU',
  booking: 'B.',
  coordinadora: 'Co',
  servientrega: 'Se',
  dropi: 'Dr',
  effi: 'Ef',
  rappi: 'Ra',
  bold: 'Bo',
  envia: 'En',
  interrapidisimo: 'IR',
  bancolombia: 'Bc',
  breb: 'B-B',
  redeban: 'Rb',
};

export function tieneSimbolo(id: string): id is MarcaConSimbolo {
  return (MARCAS_CON_SIMBOLO as readonly string[]).includes(id);
}

/**
 * Iniciales de un id: las fijas si existen; si no, primera letra de las dos primeras palabras
 * (`google_ads` → «GA») o las dos primeras letras (`nuevo` → «Nu»).
 */
export function inicialesDeServicio(id: string): string {
  const fija = INICIALES_PROVISIONALES[id];
  if (fija) return fija;
  const palabras = id
    .split(/[_\-\s.]+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);
  if (palabras.length === 0) return '?';
  if (palabras.length === 1) {
    const p = palabras[0];
    return p.charAt(0).toUpperCase() + p.slice(1, 2).toLowerCase();
  }
  return (palabras[0].charAt(0) + palabras[1].charAt(0)).toUpperCase();
}
