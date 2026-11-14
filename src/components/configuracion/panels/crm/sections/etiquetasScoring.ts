/**
 * Valores de fábrica del Scoring (GOC): se GUARDAN siempre en español y se
 * TRADUCEN solo al mostrarlos (decisión del dueño, 2026-11-14).
 *
 * Tras pasar Configuración a cuatro idiomas, los indicadores por defecto se
 * armaban con `t(...)` y se guardaban en el idioma de quien guardaba: una
 * organización quedaba con «Budget» o «Orçamento» para siempre. Ahora:
 *  - los valores de fábrica son estas constantes en español (lo que va a la BD);
 *  - `claveFabrica(etiqueta)` dice si una etiqueta guardada es de fábrica y cuál;
 *    la pantalla la traduce con `porDefecto.<clave>`;
 *  - lo que escribió la persona no está en el mapa y se muestra tal cual.
 *
 * Puro (sin React): lo usan el configurador y sus pruebas.
 */
import type { ScoringIndicator } from '@/lib/services/crm/scoringService';

/** Texto en español de cada valor de fábrica, por su clave i18n en `configuracionTextos.scoringConfigurator.porDefecto`. */
export const ETIQUETAS_FABRICA = {
  engagement: 'Engagement',
  presupuesto: 'Presupuesto',
  timeline: 'Timeline',
  bajo: 'Bajo',
  medio: 'Medio',
  alto: 'Alto',
  sinPresupuesto: 'Sin presupuesto',
  limitado: 'Limitado',
  confirmado: 'Confirmado',
  lejano: 'Lejano',
  cercano: 'Cercano',
  inmediato: 'Inmediato',
  nuevoIndicador: 'Nuevo indicador',
  nuevaOpcion: 'Nueva opción',
} as const;

export type ClaveFabrica = keyof typeof ETIQUETAS_FABRICA;

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

const POR_TEXTO: ReadonlyMap<string, ClaveFabrica> = new Map(
  (Object.entries(ETIQUETAS_FABRICA) as [ClaveFabrica, string][]).map(([clave, texto]) => [normalizar(texto), clave]),
);

/**
 * Clave de fábrica de una etiqueta GUARDADA (en español; «Nueva opcion» sin
 * tilde también, que es como se guardaba antes). `null` si la escribió la persona.
 */
export function claveFabrica(etiqueta: string | null | undefined): ClaveFabrica | null {
  if (!etiqueta) return null;
  return POR_TEXTO.get(normalizar(etiqueta)) ?? null;
}

const E = ETIQUETAS_FABRICA;

/** Indicadores por defecto, en español: es lo que se guarda si la persona no los cambia. */
export const INDICADORES_FABRICA: readonly ScoringIndicator[] = [
  {
    key: 'engagement',
    label: E.engagement,
    weight: 30,
    options: [
      { value: 'low', label: E.bajo, score: 1 },
      { value: 'medium', label: E.medio, score: 2 },
      { value: 'high', label: E.alto, score: 3 },
    ],
  },
  {
    key: 'budget',
    label: E.presupuesto,
    weight: 40,
    options: [
      { value: 'none', label: E.sinPresupuesto, score: 0 },
      { value: 'limited', label: E.limitado, score: 1 },
      { value: 'confirmed', label: E.confirmado, score: 3 },
    ],
  },
  {
    key: 'timeline',
    label: E.timeline,
    weight: 30,
    options: [
      { value: 'distant', label: E.lejano, score: 1 },
      { value: 'near', label: E.cercano, score: 2 },
      { value: 'immediate', label: E.inmediato, score: 3 },
    ],
  },
];

/** Copia nueva de los indicadores por defecto (el estado del formulario los muta). */
export function indicadoresFabrica(): ScoringIndicator[] {
  return INDICADORES_FABRICA.map((i) => ({ ...i, options: i.options.map((o) => ({ ...o })) }));
}
