/**
 * Lienzo de la Carta QR por pasos (goadmin-websites, lib/restaurant/pasosMesa.ts): en «modo mesa»
 * el sitio muestra UN paso a la vez (bienvenida, carta, pedido, cuenta, pagar, valorar…). Al
 * seleccionar una sección, desplazarse a ella no sirve (está oculta en los otros pasos): el editor
 * le pide al sitio el paso de esa sección con `goadmin:paso` y el sitio resuelve cuál es (lámina
 * 17: al editar «Cuenta de la mesa», el lienzo muestra la cuenta). Encabezado y pie: el sitio los
 * muestra en la bienvenida, así que siguen siendo seleccionables.
 *
 * Qué página va por pasos: la MISMA regla que `esPaginaModoMesa` del sitio (lib/restaurant/
 * modoMesa.ts): tipo `carta_qr`, o slug `carta-qr` con alguna sección de mesa. Cualquier otra
 * página, `goadmin:scroll` como siempre.
 *
 * Puro: lo prueban los tests.
 */

/** Secciones que solo existen en la mesa (contrato seccionesMesa.ts). */
export const SECCIONES_DE_MESA: readonly string[] = ['table_service', 'table_order', 'table_bill', 'visit_feedback'];

interface SeccionLienzo {
  section_type: string;
  section_variant?: string | null;
}

export function lienzoPorPasos(
  secciones: readonly SeccionLienzo[],
  pagina?: { tipo?: string | null; slug?: string | null } | null,
): boolean {
  if (pagina?.tipo === 'carta_qr') return true;
  if ((pagina?.slug ?? '').replace(/^\/+/, '') !== 'carta-qr') return false;
  return secciones.some(
    (s) => SECCIONES_DE_MESA.includes(s.section_type) || (s.section_type === 'restaurant_hero' && s.section_variant === 'mesa'),
  );
}

/** Mensajes al lienzo al seleccionar: resaltar y, por pasos, pedir su paso; si no, desplazarse. */
export function mensajesSeleccion(seleccion: string | null, porPasos: boolean): Record<string, unknown>[] {
  const mensajes: Record<string, unknown>[] = [{ type: 'goadmin:select', sectionId: seleccion ?? null }];
  if (!seleccion) return mensajes;
  if (porPasos) {
    mensajes.push({ type: 'goadmin:paso', sectionId: seleccion });
  } else {
    mensajes.push({ type: 'goadmin:scroll', sectionId: seleccion });
  }
  return mensajes;
}
