/**
 * Mensaje claro para el usuario cuando el borrador no cumple el contrato
 * (`validarDocumentoSitio`) y por eso no se publica ni se programa.
 * Ej.: ítems del menú «Legales» con `etiqueta: null` (org 341, 25-oct-2026).
 */
export function mensajeDocumentoInvalido(errores: { ruta: string; codigo: string }[], accion: 'publicar' | 'programar'): string {
  const verbo = accion === 'publicar' ? 'publicar' : 'programar la publicación';
  const etiquetas = errores.filter((e) => /^menus\.\d+\.items\.\d+\.etiqueta$/.test(e.ruta)).length;
  const detalle =
    etiquetas > 0
      ? ` Hay ${etiquetas} enlace(s) de menú sin texto; escríbeles un nombre en Menús.`
      : ` Revisa: ${errores.slice(0, 3).map((e) => e.ruta || 'documento').join(', ')}.`;
  return `No se puede ${verbo}: el borrador tiene ${errores.length} problema(s).${detalle}`;
}
