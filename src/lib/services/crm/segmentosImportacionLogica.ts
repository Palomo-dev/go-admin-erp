/**
 * Lógica pura de «Importar lista» de Segmentos (Figma CRM 1384:17). La usan
 * el diálogo (navegador) y la ruta `POST /api/crm/segments/import` (servidor).
 */

/**
 * Valores de una lista importada (uno por línea o separados por coma/punto y
 * coma): correos, teléfonos o documentos. Sin repetidos y con tope.
 */
export const MAX_VALORES_IMPORTACION = 5000;

export function valoresDeLista(texto: string): string[] {
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const crudo of texto.split(/[\r\n,;\t]+/)) {
    const v = crudo.trim().replace(/^"|"$/g, '').trim();
    if (!v) continue;
    const clave = v.toLocaleLowerCase('es');
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    out.push(v);
    if (out.length >= MAX_VALORES_IMPORTACION) break;
  }
  return out;
}

/**
 * Un valor con «@» se busca como correo; el resto, como documento (tal cual)
 * o como teléfono (últimos 10 dígitos): una cédula y un celular pueden tener
 * los mismos 10 dígitos, así que no se adivina cuál es.
 */
export const esCorreo = (v: string): boolean => v.includes('@');

/** Últimos 10 dígitos: la forma de comparar teléfonos con o sin indicativo. */
export const colaTelefono = (v: string): string => v.replace(/\D/g, '').slice(-10);

/** Variantes con las que un teléfono puede estar guardado en `customers.phone`. */
export function variantesTelefono(v: string): string[] {
  const cola = colaTelefono(v);
  if (cola.length < 7) return [];
  const variantes = new Set([v.trim(), cola, `+57${cola}`, `57${cola}`, `+57 ${cola}`]);
  if (cola.length === 10) variantes.add(`+57 ${cola.slice(0, 3)} ${cola.slice(3, 6)} ${cola.slice(6)}`);
  return [...variantes];
}
