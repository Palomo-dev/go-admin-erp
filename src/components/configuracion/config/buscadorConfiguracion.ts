/**
 * Buscador de Configuración: lleva directo a cualquier ajuste por palabra
 * clave («interés», «factura electrónica», «números de prueba»).
 *
 * Puro y sin React: el índice se arma con los textos del idioma activo
 * (`configuracionUnificada.*` en messages) y SOLO con las secciones que el
 * servidor dejó ver (módulos del plan). No distingue tildes, mayúsculas ni
 * eñes: «interes» encuentra «interés».
 */
import { rutaSeccion, type SeccionConfig } from './configSectionsRegistry';

export interface EntradaIndice {
  seccionId: string;
  /** Ancla del ajuste; ausente si la entrada es la sección entera. */
  ancla?: string;
  titulo: string;
  modulo: string;
  seccion: string;
  palabras: readonly string[];
  href: string;
}

export interface ResultadoBusqueda extends EntradaIndice {
  /** «Módulo › Sección»: dónde vive el ajuste (el título es el ajuste). */
  ruta: string;
}

/** Textos que necesita el índice, ya traducidos. */
export interface TextosIndice {
  modulo: (moduloId: string) => string;
  seccion: (clave: string) => { titulo: string; palabras: string };
  ajuste: (clave: string) => { titulo: string; palabras: string };
}

/** Minúsculas, sin tildes ni diéresis, espacios colapsados. «Interés» → «interes». */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function palabrasDe(lista: string): string[] {
  return lista
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

export function construirIndice(secciones: readonly SeccionConfig[], textos: TextosIndice): EntradaIndice[] {
  const indice: EntradaIndice[] = [];
  for (const s of secciones) {
    const modulo = textos.modulo(s.modulo);
    const sec = textos.seccion(s.clave);
    indice.push({ seccionId: s.id, titulo: sec.titulo, modulo, seccion: sec.titulo, palabras: palabrasDe(sec.palabras), href: rutaSeccion(s.id) });
    for (const a of s.ajustes) {
      const aj = textos.ajuste(a.clave);
      indice.push({
        seccionId: s.id,
        ancla: a.ancla,
        titulo: aj.titulo,
        modulo,
        seccion: sec.titulo,
        palabras: palabrasDe(aj.palabras),
        href: rutaSeccion(s.id, { ancla: a.ancla }),
      });
    }
  }
  return indice;
}

/**
 * Busca en el índice. Cada palabra de la consulta tiene que aparecer en el
 * título, las palabras clave, el módulo o la sección. Orden: título que empieza
 * por la consulta, título que la contiene, palabra clave; los ajustes antes que
 * la sección cuando empatan (llevan más directo).
 */
export function buscarAjustes(consulta: string, indice: readonly EntradaIndice[], limite = 20): ResultadoBusqueda[] {
  const q = normalizar(consulta);
  if (!q) return [];
  const tokens = q.split(' ');
  const puntuados: { r: ResultadoBusqueda; puntos: number; orden: number }[] = [];
  indice.forEach((e, orden) => {
    const titulo = normalizar(e.titulo);
    const palabras = e.palabras.map(normalizar);
    const pajar = [titulo, ...palabras, normalizar(e.modulo), normalizar(e.seccion)].join(' | ');
    if (!tokens.every((tk) => pajar.includes(tk))) return;
    let puntos = 0;
    if (titulo.startsWith(q)) puntos += 100;
    else if (titulo.includes(q)) puntos += 60;
    if (palabras.some((p) => p === q)) puntos += 50;
    else if (palabras.some((p) => p.includes(q))) puntos += 30;
    if (e.ancla) puntos += 5;
    puntuados.push({ r: { ...e, ruta: `${e.modulo} › ${e.seccion}` }, puntos, orden });
  });
  return puntuados
    .sort((a, b) => b.puntos - a.puntos || a.orden - b.orden)
    .slice(0, limite)
    .map((p) => p.r);
}
