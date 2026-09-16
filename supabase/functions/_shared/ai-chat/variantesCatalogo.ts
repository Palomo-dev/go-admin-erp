/**
 * Variantes de producto (tallas, colores, presentaciones) para el contexto del
 * bot. Modulo puro: sin base de datos, probado con Jest.
 *
 * Contexto (2026-09-15): el modelo solo recibia "Disponible en 5
 * presentaciones (pregunta cual quiere)". Nunca veia cuales eran. Con un
 * cliente pidiendo "talla 40" respondia "no tenemos talla 40" sin saber que
 * las tallas del catalogo eran "7.5 US … 9.5 US".
 */

export type VarianteCatalogo = {
  raiz: number;
  id: number;
  nombre: string;
  atributos: Record<string, string> | null;
  stock: number | string | null;
  precio: number | string | null;
  orden: number;
};

const ATRIBUTOS_DE_TALLA = /^(talla|tallaje|tamaño|tamano|size|numero|número)$/i;

/** ¿Este atributo es una talla de ropa o calzado? ("Tamaño: 100 ml" no lo es). */
export function esAtributoDeTalla(nombre: string, valor: string): boolean {
  if (!ATRIBUTOS_DE_TALLA.test(nombre.trim())) return false;
  // Una talla es un numero (7.5, 40, 10.5 US), una letra (S, M, XL, 2XL) o
  // un rango (10/12). Medidas con unidad fisica no son tallas.
  const v = valor.trim();
  if (/\b(ml|cc|cm|mm|litros?|lt|oz|onzas|kg|g|gr|tazas?|x)\b/i.test(v)) return false;
  return /^(\d+([.,]\d+)?(\s?(us|usa|eu|uk|co|col|cm|br|mx))?|[0-9]+\/[0-9]+|xxs|xs|s|m|l|xl|xxl|2xl|3xl|4xl|\d+[a-z]?)$/i.test(v);
}

function valorDeVariante(v: VarianteCatalogo): { atributo: string; valor: string; esTalla: boolean } | null {
  const entradas = Object.entries(v.atributos || {}).filter(([, val]) => typeof val === 'string' && val.trim() !== '');
  if (entradas.length === 0) return null;
  // Con varios atributos ("Talla" y "Color") se muestran todos: "8 US / Negro".
  return {
    atributo: entradas.map(([k]) => k).join(' / '),
    valor: entradas.map(([, val]) => String(val).trim()).join(' / '),
    esTalla: entradas.some(([k, val]) => esAtributoDeTalla(k, String(val))),
  };
}

function textoStock(stock: number | string | null): string {
  if (stock === null || stock === undefined) return '';
  const n = Number(stock);
  if (Number.isNaN(n)) return '';
  return n > 0 ? ` (${n})` : ' (AGOTADA)';
}

export type ResumenVariantes = {
  /** Texto por raiz, listo para pegar tras la linea del producto. */
  porRaiz: Map<number, string>;
  /** Alguna variante mostrada es una talla de ropa/calzado. */
  hayTallas: boolean;
};

/**
 * "Tamaño disponibles: 7.5 US (100), 8 US (100), 9 US (AGOTADA)". Si hay mas
 * de `maximo`, se recorta y se avisa. Variantes sin atributos usan su nombre.
 */
export function resumirVariantes(variantes: VarianteCatalogo[], maximo = 30): ResumenVariantes {
  const porRaiz = new Map<number, string>();
  let hayTallas = false;
  const grupos = new Map<number, VarianteCatalogo[]>();
  for (const v of variantes) {
    const lista = grupos.get(Number(v.raiz)) || [];
    lista.push(v);
    grupos.set(Number(v.raiz), lista);
  }
  for (const [raiz, lista] of grupos) {
    const ordenadas = [...lista].sort((a, b) => a.orden - b.orden);
    const mostradas = ordenadas.slice(0, maximo);
    let atributo = '';
    const partes: string[] = [];
    for (const v of mostradas) {
      const av = valorDeVariante(v);
      if (av) {
        atributo = atributo || av.atributo;
        if (av.esTalla) hayTallas = true;
        partes.push(`${av.valor}${textoStock(v.stock)}`);
      } else {
        partes.push(`${v.nombre}${textoStock(v.stock)}`);
      }
    }
    if (partes.length === 0) continue;
    const etiqueta = atributo ? `${atributo} disponibles` : 'Presentaciones';
    const resto = ordenadas.length > maximo ? ` … y ${ordenadas.length - maximo} más` : '';
    porRaiz.set(raiz, `${etiqueta}: ${partes.join(', ')}${resto}`);
  }
  return { porRaiz, hayTallas };
}

/**
 * Guia de conversion aproximada. Va al contexto SOLO cuando los productos
 * mostrados tienen tallas. Si la organizacion escribe su propia tabla en las
 * reglas del sistema (`ai_settings.system_rules`), esa manda: aqui se le dice
 * al modelo que la de las reglas tiene prioridad.
 */
export const GUIA_TALLAS = `GUÍA DE TALLAS (equivalencia APROXIMADA, varía según la marca; si las INSTRUCCIONES PRINCIPALES traen una tabla propia, usa esa):
- Hombre — US → Colombia/EU: 6→38 · 6.5→38.5 · 7→39 · 7.5→39.5 · 8→40 · 8.5→40.5/41 · 9→41 · 9.5→42 · 10→42.5 · 10.5→43 · 11→44 · 12→45 · 13→46
- Mujer — US → Colombia/EU: 5→35 · 5.5→35.5 · 6→36 · 6.5→36.5 · 7→37 · 7.5→37.5 · 8→38 · 8.5→38.5 · 9→39 · 9.5→39.5 · 10→40 · 11→41
- Niños — US → CO/EU: 10C→27 · 11C→28 · 12C→30 · 13C→31 · 1Y→32 · 2Y→33 · 3Y→34 · 4Y→36 · 5Y→37 · 6Y→38
CÓMO RESPONDER POR TALLAS:
1. Las tallas del catálogo se muestran tal como aparecen en la lista de cada producto (por ejemplo "8 US"). Esa lista es la única verdad: nunca digas que una talla no está sin haberla buscado ahí.
2. Si el cliente da la talla en otro sistema ("talla 40", "39 colombiana"), conviértela con esta guía, ofrece la equivalente y las dos vecinas (media talla arriba y abajo) que estén en la lista, y dile que la equivalencia es aproximada.
3. Si la talla equivalente está AGOTADA o no aparece, dilo con claridad y ofrece las tallas más cercanas que sí hay.
4. Si duda entre dos tallas, pregúntale cuánto mide su pie en centímetros o qué talla usa en otra marca conocida.
5. Nunca inventes tallas ni stock que no estén en la lista.

`;

/**
 * Medidas que aparecen en la descripcion de un producto: "Medidas: 30 x 20 cm",
 * "Capacidad 1,5 litros", "Peso 2 kg". En una tienda de hogar el 84% de las
 * descripciones traen medidas y el bot no veia ninguna: ante "de cuantos litros
 * es" respondia que no tenia esa informacion.
 *
 * Devuelve los fragmentos (separados por punto, coma, salto o barra) que
 * contienen un numero con unidad, recortados a `maximo` caracteres.
 */
export function extraerMedidas(descripcion: string | null | undefined, maximo = 160): string {
  if (!descripcion) return '';
  const texto = descripcion
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!texto) return '';
  const unidad = /\d+([.,]\d+)?\s?(cm|mm|mts?|m|ml|cc|litros?|lts?|l|kg|kgs|gramos?|grs?|g|oz|onzas?|pulgadas?|"|”|tazas?|puestos?|piezas?|unidades?|w|watts?|v)\b/i;
  // Se parte por punto, coma, punto y coma, barra o viñeta, pero no dentro de
  // un decimal: "35,2 cm" y "1.5 litros" se quedan enteros.
  const fragmentos = texto.split(/[;|•]+|[.,](?=\s|$)/).map((f) => f.trim()).filter((f) => f && unidad.test(f));
  if (fragmentos.length === 0) return '';
  let salida = '';
  for (const f of fragmentos) {
    const candidato = salida ? `${salida}; ${f}` : f;
    if (candidato.length > maximo) {
      if (!salida) salida = f.slice(0, maximo - 1) + '…';
      break;
    }
    salida = candidato;
  }
  return salida;
}
