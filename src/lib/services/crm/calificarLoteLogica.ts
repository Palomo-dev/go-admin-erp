/**
 * «Calificar en lote» (CRM, Leads): reglas puras, sin React ni Supabase. Las
 * usan el servicio (`calificarLeadsEnLote`), la ruta
 * `POST /api/crm/leads/qualify-bulk` y la pantalla.
 */

/** Marcador del patrón de nombre: se reemplaza por el nombre de cada lead. */
export const MARCADOR_CLIENTE = '{cliente}';

/** Máximo de leads por lote (la ruta responde 400 por encima). */
export const MAX_LOTE_CALIFICAR = 100;

/** Mismo límite que `name` en `oportunidadAltaSchema` (varchar de `opportunities.name`). */
export const LARGO_MAXIMO_NOMBRE = 255;

/** Respaldo cuando el lead no tiene nombre (`customers.full_name` vacío). */
export const LEAD_SIN_NOMBRE = 'Lead sin nombre';

/**
 * Nombre de la oportunidad de un lead: el patrón con cada `{cliente}`
 * reemplazado por el nombre del lead (sin espacios sobrantes; «Lead sin
 * nombre» si no tiene). Se recorta a 255 caracteres con «…». Un patrón sin
 * marcador se usa tal cual (los nombres se repiten; la pantalla lo avisa) y un
 * patrón vacío deja el nombre del lead.
 */
export function nombreDesdePatron(patron: string, nombreLead: string | null | undefined): string {
  const cliente = (nombreLead ?? '').trim().replace(/\s+/g, ' ') || LEAD_SIN_NOMBRE;
  const nombre = patron.split(MARCADOR_CLIENTE).join(cliente).trim().replace(/\s+/g, ' ') || cliente;
  return nombre.length > LARGO_MAXIMO_NOMBRE ? `${nombre.slice(0, LARGO_MAXIMO_NOMBRE - 1).trimEnd()}…` : nombre;
}

/** ¿El patrón personaliza el nombre por lead? Sin marcador, todos se llaman igual. */
export function patronPersonaliza(patron: string): boolean {
  return patron.includes(MARCADOR_CLIENTE);
}
