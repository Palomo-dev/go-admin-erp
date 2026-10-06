/**
 * «Publicar» también activa la web (ADR-002 D4 en un solo paso para el dueño).
 *
 * Antes, la primera vez hacían falta dos acciones: publicar la revisión
 * (`publish_site_revision`) y después «Activar en la web» (`set_site_v2_adoption`). Mientras no
 * se activaba, la web seguía mostrando el sitio anterior y el dueño creía que no había
 * funcionado. Ahora, si el sitio (principal o de una sede) aún no está activo y el lector
 * público de V2 está desplegado, publicar lo activa en la misma llamada al servidor.
 *
 * Este módulo es puro (sin Supabase ni React): lo usan la ruta de publicaciones, el editor y
 * sus pruebas. La publicación y la activación siguen siendo las de `siteDocumentService`.
 */

/** Resultado de la activación pedida junto con la publicación. */
export type ActivacionAlPublicar = 'activada' | 'fallo' | 'no_aplica';

export interface EstadoParaActivar {
  /** `website_site_states.v2_adopted` antes de publicar. */
  v2Adoptado: boolean;
  /** NEXT_PUBLIC_WEBSITE_V2_LECTOR=1: la web pública ya sabe leer la revisión publicada. */
  lectorListo: boolean;
}

/**
 * ¿Publicar debe activar la web? Solo si aún no está activa y el lector está listo: sin lector,
 * activar dejaría la web congelada (la ruta de adopción lo rechaza por lo mismo).
 */
export function debeActivarAlPublicar(e: EstadoParaActivar): boolean {
  return !e.v2Adoptado && e.lectorListo;
}

/**
 * Publica y, si corresponde, activa. Si activar falla la revisión YA quedó publicada: no se
 * deshace ni se lanza el error, se devuelve `activacion: 'fallo'` para que el aviso ofrezca
 * «Activar en la web» como reintento. Si publicar falla, el error sube tal cual.
 */
export async function publicarConActivacion<R>(opciones: {
  pedida: boolean;
  estado: EstadoParaActivar;
  publicar: () => Promise<R>;
  activar: () => Promise<unknown>;
  alFallarActivacion?: (error: unknown) => void;
}): Promise<R & { activacion: ActivacionAlPublicar; errorActivacion?: string }> {
  const resultado = await opciones.publicar();
  if (!opciones.pedida || !debeActivarAlPublicar(opciones.estado)) return { ...resultado, activacion: 'no_aplica' };
  try {
    await opciones.activar();
    return { ...resultado, activacion: 'activada' };
  } catch (error) {
    opciones.alFallarActivacion?.(error);
    const mensaje = error instanceof Error && error.message ? error.message : undefined;
    return { ...resultado, activacion: 'fallo', ...(mensaje ? { errorActivacion: mensaje } : {}) };
  }
}

/** Qué aviso mostrar después de publicar. */
export type AvisoTrasPublicar =
  /** La web muestra esta versión (se activó ahora o ya estaba activa): «Ver sitio publicado». */
  | { tipo: 'web_actualizada'; activadaAhora: boolean }
  /** Publicada, pero activar falló: el aviso ofrece «Activar en la web» como reintento. */
  | { tipo: 'fallo_activar' }
  /** Sin lector (o sin activar): queda en el historial y la web sigue con el sitio anterior. */
  | { tipo: 'sin_activar' };

export function avisoTrasPublicar(e: {
  v2AdoptadoAntes: boolean;
  activacion: ActivacionAlPublicar | undefined;
}): AvisoTrasPublicar {
  if (e.activacion === 'activada') return { tipo: 'web_actualizada', activadaAhora: true };
  if (e.activacion === 'fallo') return { tipo: 'fallo_activar' };
  if (e.v2AdoptadoAntes) return { tipo: 'web_actualizada', activadaAhora: false };
  return { tipo: 'sin_activar' };
}
