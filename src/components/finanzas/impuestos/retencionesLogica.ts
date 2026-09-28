/**
 * Tipo de una retención para mostrarla en Finanzas › Impuestos › Retenciones
 * (Figma 1012:87187: columna «Tipo» con ReteFuente · ReteIVA · ReteICA).
 *
 * Solo es presentación: la clase (impuesto o retención) sale de
 * `organization_taxes.kind` y el código DIAN de la retención de
 * `mapWithholdingCode` (factusService). `list_organization_taxes` no trae el
 * código de la plantilla, así que el tipo se deduce del código si llega y, si
 * no, del nombre («Retención en la Fuente 4%», «ICA Bogotá 9.66x1000»).
 */
export type TipoRetencion = 'retefuente' | 'reteiva' | 'reteica' | 'otra';

function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase();
}

export function tipoRetencion(codigo: string | null | undefined, nombre: string | null | undefined): TipoRetencion {
  const c = normalizar(codigo).replace(/[\s-]/g, '_');
  if (c) {
    if (c.startsWith('RETEIVA') || c.startsWith('RETE_IVA')) return 'reteiva';
    if (c.startsWith('RETEICA') || c.startsWith('RETE_ICA') || c.startsWith('ICA')) return 'reteica';
    if (c.startsWith('RETE')) return 'retefuente';
  }
  const n = normalizar(nombre);
  if (/\bRETE\s*IVA\b|\bIVA\b/.test(n)) return 'reteiva';
  if (/\bRETE\s*ICA\b|\bICA\b/.test(n)) return 'reteica';
  if (/\bRETE\s*FUENTE\b|\bFUENTE\b|\bRENTA\b/.test(n)) return 'retefuente';
  return 'otra';
}
