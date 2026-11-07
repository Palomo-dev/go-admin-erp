/**
 * Lógica de los asistentes de conexión (Frente INT, diseño 85-03…44), sin React.
 *
 * - Qué pasos tiene cada asistente según el proveedor y el modo.
 * - Qué hacer después de una prueba de llaves (solo se avanza con «correcta»: nada se guardó si no).
 * - Cómo se leen las verificaciones de una prueba para la lista de 85-08.
 * - Cómo se interpreta la respuesta de verificar una OTA (cuenta de socio, sin autorizar…).
 * - Domicilios: nunca se puede activar mientras no exista la cuenta de aliado.
 */
import type { DefinicionLlaves } from '@/lib/services/integrations/conexiones/definicionesLlaves';
import type { Prueba, ResultadoPrueba } from '@/lib/services/integrations/conexiones/probadoresLlaves.server';

// ─── Llaves ──────────────────────────────────────────────────────────────────

export type PasoLlaves = 'ambiente' | 'llaves' | 'prueba' | 'webhook' | 'uso';

/**
 * Pasos del asistente de llaves. Al reemplazar llaves (85-12) el ambiente es el de la conexión
 * y el webhook y el uso ya están configurados: solo «dónde están» y «pegar y probar».
 */
export function pasosLlaves(def: Pick<DefinicionLlaves, 'webhook' | 'metodoPago' | 'ambientes'>, reemplazo: boolean): PasoLlaves[] {
  if (reemplazo) return ['llaves', 'prueba'];
  const pasos: PasoLlaves[] = [];
  if (def.ambientes.length > 1) pasos.push('ambiente');
  pasos.push('llaves', 'prueba');
  if (def.webhook) pasos.push('webhook');
  if (def.metodoPago) pasos.push('uso');
  return pasos;
}

export function pasoSiguiente<P extends string>(pasos: readonly P[], actual: P): P | null {
  const i = pasos.indexOf(actual);
  return i >= 0 && i < pasos.length - 1 ? pasos[i + 1] : null;
}

export function pasoAnterior<P extends string>(pasos: readonly P[], actual: P): P | null {
  const i = pasos.indexOf(actual);
  return i > 0 ? pasos[i - 1] : null;
}

export type EstadoPruebaUI = 'editando' | 'probando' | 'fallo' | 'correcta';

/** Tras la prueba: solo «correcta» guarda y avanza; lo demás se queda en el paso con el motivo. */
export function estadoTrasPrueba(resultado: ResultadoPrueba): EstadoPruebaUI {
  return resultado === 'correcta' ? 'correcta' : 'fallo';
}

export type EstadoVerificacion = 'listo' | 'rechazada' | 'sin_probar';

/**
 * Filas de 85-08: cada campo de la definición con su estado.
 * - correcta: lo verificado queda «listo»; el resto «sin probar» (p. ej. el secreto de eventos se
 *   confirma con el primer webhook firmado).
 * - rechazada: el ÚLTIMO verificado es el que el proveedor rechazó; los anteriores pasaron.
 * - sin_respuesta / sin_prueba: nada se puede afirmar → «sin probar».
 */
export function verificacionesDePrueba(propositos: readonly string[], prueba: Pick<Prueba, 'resultado' | 'verificado'>): { proposito: string; estado: EstadoVerificacion }[] {
  const verificado = prueba.verificado ?? [];
  return propositos.map((proposito) => {
    const i = verificado.indexOf(proposito);
    if (i < 0) return { proposito, estado: 'sin_probar' as const };
    if (prueba.resultado === 'correcta') return { proposito, estado: 'listo' as const };
    if (prueba.resultado === 'rechazada') {
      return { proposito, estado: i === verificado.length - 1 ? ('rechazada' as const) : ('listo' as const) };
    }
    return { proposito, estado: 'sin_probar' as const };
  });
}

/** Mensaje (clave i18n) del fallo de una prueba: rechazo del proveedor ≠ sin respuesta. */
export function claveFalloPrueba(resultado: ResultadoPrueba): 'rechazada' | 'sinRespuesta' | 'sinPrueba' {
  if (resultado === 'rechazada') return 'rechazada';
  if (resultado === 'sin_prueba') return 'sinPrueba';
  return 'sinRespuesta';
}

// ─── OTA (Booking / Expedia) ─────────────────────────────────────────────────

export type ModoOta = 'api' | 'ical';
export type PasoOta = 'modo' | 'autorizar' | 'verificar' | 'habitaciones' | 'sincronizar' | 'calendarios';

export function pasosOta(modo: ModoOta): PasoOta[] {
  return modo === 'api' ? ['modo', 'autorizar', 'verificar', 'habitaciones', 'sincronizar'] : ['modo', 'calendarios'];
}

export type ResultadoVerificacionOta = 'verificada' | 'sin_autorizar' | 'cuenta_socio' | 'ya_existe' | 'error';

/** Interpreta la respuesta de `POST /api/integrations/conexiones/ota`. */
export function interpretarVerificacionOta(status: number, cuerpo: { codigo?: unknown; verificada?: unknown }): ResultadoVerificacionOta {
  if (status === 409 && cuerpo.codigo === 'CUENTA_SOCIO') return 'cuenta_socio';
  if (status === 409 && cuerpo.codigo === 'YA_EXISTE') return 'ya_existe';
  if (status >= 200 && status < 300) return cuerpo.verificada === true ? 'verificada' : 'sin_autorizar';
  return 'error';
}

/** Relaciones listas para guardar: solo las que tienen id externo; cuántas quedan sin relacionar. */
export function relacionesParaGuardar(relaciones: Record<string, string>): { lista: { espacioId: string; externoId: string }[]; sinRelacionar: number } {
  const entradas = Object.entries(relaciones);
  const lista = entradas
    .map(([espacioId, externoId]) => ({ espacioId, externoId: externoId.trim() }))
    .filter((r) => r.externoId.length > 0);
  return { lista, sinRelacionar: entradas.length - lista.length };
}

// ─── iCal ────────────────────────────────────────────────────────────────────

/** URL de importación aceptable en el navegador (el servidor vuelve a validar y rechaza privadas). */
export function urlIcalValida(url: string): boolean {
  const v = url.trim();
  if (!v) return false;
  try {
    return new URL(v).protocol === 'https:';
  } catch {
    return false;
  }
}

export function enlacesIcalParaGuardar(urls: Record<string, string>): { lista: { espacioId: string; urlImportacion: string }[]; invalidos: string[] } {
  const lista: { espacioId: string; urlImportacion: string }[] = [];
  const invalidos: string[] = [];
  for (const [espacioId, url] of Object.entries(urls)) {
    if (!url.trim()) continue;
    if (urlIcalValida(url)) lista.push({ espacioId, urlImportacion: url.trim() });
    else invalidos.push(espacioId);
  }
  return { lista, invalidos };
}

// ─── Domicilios ──────────────────────────────────────────────────────────────

export const PASOS_DOMICILIOS = ['tienda', 'menu', 'pedidos', 'horario'] as const;
export type PasoDomicilios = (typeof PASOS_DOMICILIOS)[number];

/**
 * ¿Hay conector de domicilios en el código? Hoy no (sin cuenta de aliado ni API). Cuando exista, se
 * cambia aquí y el asistente activa su botón final solo si el catálogo no lo marca en construcción.
 */
export const CONECTOR_DOMICILIOS_EN_CODIGO = false;

/** Sin conector ni cuenta de aliado no hay activación posible: nunca se simula. */
export function puedeActivarDomicilios(item: { estado: string }): boolean {
  return CONECTOR_DOMICILIOS_EN_CODIGO && item.estado !== 'en_construccion';
}

// ─── OAuth ───────────────────────────────────────────────────────────────────

export type ProveedorOauth = 'meta' | 'tiktok' | 'google_ads';

export const RUTA_OAUTH: Record<ProveedorOauth, string> = {
  meta: '/api/integrations/meta/oauth/authorize',
  tiktok: '/api/integrations/tiktok/oauth/authorize',
  google_ads: '/api/integrations/google-ads/oauth/authorize',
};

export type ResultadoOauth = { tipo: 'redirigir'; url: string } | { tipo: 'sin_app' } | { tipo: 'error' };

/** 500/503 de la ruta de autorización = falta configurar la app del proveedor en el servidor. */
export function interpretarOauth(status: number, cuerpo: { url?: unknown }): ResultadoOauth {
  if (status >= 200 && status < 300 && typeof cuerpo.url === 'string' && /^https:\/\//.test(cuerpo.url)) {
    return { tipo: 'redirigir', url: cuerpo.url };
  }
  if (status === 500 || status === 503) return { tipo: 'sin_app' };
  return { tipo: 'error' };
}
