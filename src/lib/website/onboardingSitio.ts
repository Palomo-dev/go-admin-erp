/**
 * Avance del asistente de creación del sitio (Figma A/03a-03j), guardado en
 * `website_site_states.onboarding` (jsonb, default '{}', CHECK de objeto ≤ 64 KB;
 * RLS de update con `fn_website_tiene_permiso(org, 'website.sites.edit')` y
 * grant por columna). Puro: lo comparten el route handler, el Resumen y el
 * asistente.
 *
 * El giro que se elige aquí es SOLO del sitio: no cambia `organizations.type_id`.
 */
import { z } from 'zod';

export const GIROS_SITIO = ['restaurante', 'tienda', 'hotel', 'servicios', 'gimnasio', 'otro'] as const;
export type GiroSitio = (typeof GIROS_SITIO)[number];

export const OBJETIVOS_SITIO = ['reservas', 'carta', 'pedidos', 'venta_en_linea', 'buscadores'] as const;
export type ObjetivoSitio = (typeof OBJETIVOS_SITIO)[number];

export const OPCIONES_DOMINIO = ['gratis', 'conectar', 'comprar'] as const;
export type OpcionDominio = (typeof OPCIONES_DOMINIO)[number];

/** Pasos del asistente, en orden (A/03: «Paso N de 6»). */
export const PASOS_ASISTENTE = ['giro', 'plantilla', 'estilo', 'datos', 'dominio', 'publicar'] as const;
export type PasoAsistente = (typeof PASOS_ASISTENTE)[number];
export const TOTAL_PASOS_ASISTENTE = PASOS_ASISTENTE.length;

const esquemaPasos = z
  .object({
    plantilla: z.string().min(1).max(80).optional(),
    estilo: z.string().min(1).max(80).optional(),
    datos: z.boolean().optional(),
    dominio: z.enum(OPCIONES_DOMINIO).optional(),
  })
  .strict();

export const esquemaOnboarding = z
  .object({
    giro: z.enum(GIROS_SITIO).optional(),
    objetivos: z.array(z.enum(OBJETIVOS_SITIO)).max(OBJETIVOS_SITIO.length).optional(),
    pasoActual: z.number().int().min(1).max(TOTAL_PASOS_ASISTENTE).optional(),
    pasos: esquemaPasos.optional(),
    completado: z.boolean().optional(),
  })
  .strict();

export type OnboardingSitio = z.infer<typeof esquemaOnboarding>;

/**
 * Lee lo guardado sin confiar en su forma: lo que no cumple el esquema se
 * descarta campo a campo (un jsonb escrito por otra versión no rompe el Resumen).
 */
export function leerOnboarding(crudo: unknown): OnboardingSitio {
  if (!crudo || typeof crudo !== 'object' || Array.isArray(crudo)) return {};
  const fuente = crudo as Record<string, unknown>;
  const salida: OnboardingSitio = {};
  for (const clave of ['giro', 'objetivos', 'pasoActual', 'completado'] as const) {
    const r = esquemaOnboarding.shape[clave].safeParse(fuente[clave]);
    if (r.success && r.data !== undefined) (salida as Record<string, unknown>)[clave] = r.data;
  }
  if (fuente.pasos && typeof fuente.pasos === 'object') {
    const pasos: Record<string, unknown> = {};
    const crudoPasos = fuente.pasos as Record<string, unknown>;
    for (const clave of Object.keys(esquemaPasos.shape) as (keyof typeof esquemaPasos.shape)[]) {
      const r = esquemaPasos.shape[clave].safeParse(crudoPasos[clave]);
      if (r.success && r.data !== undefined) pasos[clave] = r.data;
    }
    if (Object.keys(pasos).length > 0) salida.pasos = pasos as OnboardingSitio['pasos'];
  }
  return salida;
}

export type ResultadoParche = { ok: true; onboarding: OnboardingSitio } | { ok: false; errores: string[] };

/** Valida un parche del cliente y lo funde con lo guardado (`pasos` se funde por clave). */
export function aplicarParcheOnboarding(actual: OnboardingSitio, parche: unknown): ResultadoParche {
  const r = esquemaOnboarding.safeParse(parche);
  if (!r.success) return { ok: false, errores: r.error.issues.map((i) => `${i.path.join('.') || '(raíz)'}:${i.message}`) };
  const p = r.data;
  return {
    ok: true,
    onboarding: {
      ...actual,
      ...p,
      ...(p.pasos || actual.pasos ? { pasos: { ...(actual.pasos ?? {}), ...(p.pasos ?? {}) } } : {}),
    },
  };
}

/** Giro del sitio por defecto desde `organizations.type_id` (1 restaurante … 5 gimnasio; 6 y 7 → «Otro»). */
export function giroDesdeTipo(typeId: number | null | undefined): GiroSitio {
  switch (typeId) {
    case 1:
      return 'restaurante';
    case 2:
      return 'hotel';
    case 3:
      return 'tienda';
    case 4:
      return 'servicios';
    case 5:
      return 'gimnasio';
    default:
      return 'otro';
  }
}

/** Objetivos que tienen sentido para cada giro (A/03a: «según giro»). */
export function objetivosDelGiro(giro: GiroSitio): readonly ObjetivoSitio[] {
  switch (giro) {
    case 'restaurante':
      return ['reservas', 'carta', 'pedidos', 'venta_en_linea', 'buscadores'];
    case 'tienda':
      return ['pedidos', 'venta_en_linea', 'buscadores'];
    case 'hotel':
      return ['reservas', 'buscadores'];
    default:
      return ['reservas', 'venta_en_linea', 'buscadores'];
  }
}

/** Objetivos marcados por defecto la primera vez (A/03a: restaurante con todo menos «Vender productos»). */
export function objetivosPorDefecto(giro: GiroSitio): ObjetivoSitio[] {
  return objetivosDelGiro(giro).filter((o) => o !== 'venta_en_linea' || giro === 'tienda');
}

/** Número de paso (1-6) desde `?paso=`; fuera de rango → 1. */
export function pasoDesdeParametro(valor: string | null | undefined): number {
  const n = Number(valor);
  return Number.isInteger(n) && n >= 1 && n <= TOTAL_PASOS_ASISTENTE ? n : 1;
}
