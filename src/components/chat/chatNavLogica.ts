/**
 * Reglas puras de las pestañas del Chat (sin React, para probarlas sin montar
 * nada: `__tests__/chatNavLogica.test.ts`).
 */

/** Rutas que cuelgan de cada pestaña además de la propia. */
const RUTAS_HIJAS: Record<string, readonly string[]> = {
  '/app/chat/bandeja': ['/app/chat/conversaciones'],
  '/app/chat/ia': ['/app/chat/ia'],
  '/app/chat/widget/sesiones': ['/app/chat/widget'],
};

/**
 * A dónde lleva cada pestaña. La de IA abre el Laboratorio: `/app/chat/ia`
 * solo redirige allí, y así nos ahorramos el salto.
 */
export function destinoPestanaChat(href: string): string {
  return href === '/app/chat/ia' ? '/app/chat/ia/laboratorio' : href;
}

function empiezaPor(pathname: string, prefijo: string): boolean {
  return pathname === prefijo || pathname.startsWith(`${prefijo}/`);
}

/** Href de la pestaña que corresponde a la ruta actual, o `null`. Gana el prefijo más largo. */
export function pestanaChatActiva(pathname: string, hrefs: readonly string[]): string | null {
  let mejor: { href: string; largo: number } | null = null;
  for (const href of hrefs) {
    for (const prefijo of [href, ...(RUTAS_HIJAS[href] ?? [])]) {
      if (empiezaPor(pathname, prefijo) && (!mejor || prefijo.length > mejor.largo)) {
        mejor = { href, largo: prefijo.length };
      }
    }
  }
  return mejor?.href ?? null;
}

/** La Bandeja: lleva «Nueva conversación» a la derecha de las pestañas. */
export function esRutaBandeja(pathname: string): boolean {
  return empiezaPor(pathname, '/app/chat/bandeja');
}

/**
 * Pantallas de alto fijo (lista + hilo con scroll propio): la Bandeja y la
 * vista completa de una conversación. El resto del módulo fluye con el scroll
 * del shell. En móvil estas dos no muestran las pestañas (Figma 91-chat-14/15).
 */
export function ocultaPestanasModulo(pathname: string): boolean {
  // La conversación (completa, actividad, archivos) y «Nueva conversación»
  // traen su propia cabecera con «←» y pestañas: Figma 91-chat-10…13.
  return empiezaPor(pathname, '/app/chat/conversaciones');
}

export function esPantallaAltoFijo(pathname: string): boolean {
  if (esRutaBandeja(pathname)) return true;
  const m = /^\/app\/chat\/conversaciones\/([^/]+)\/?$/.exec(pathname);
  return !!m && m[1] !== 'nueva';
}
