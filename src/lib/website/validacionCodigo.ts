/**
 * Diagnóstico del código a medida (Sitio web › Configuración › Código y píxeles).
 * Puro: no traduce, no toca el DOM y no ejecuta el JavaScript. El valor que se
 * guarda sigue siendo el texto tal cual; esto solo dice si «Listo» puede cerrar.
 */
import { LIMITE_CODIGO_MEDIDA, type PosicionCodigo } from './configuracionSitio';

export { LIMITE_CODIGO_MEDIDA };

/** Ejemplo del editor vacío. El texto guardado no lo incluye. */
export const PLACEHOLDER_CODIGO =
  '<!-- Pega aquí tu código, p. ej. <script src="https://..."></script> -->';

/** Etiquetas vacías de HTML: no necesitan cierre. */
const ETIQUETAS_VACIAS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

/** Su contenido es texto hasta la etiqueta de cierre: no se buscan etiquetas adentro. */
const ETIQUETAS_CRUDAS = new Set(['script', 'style', 'textarea', 'title']);

/** En `<head>` estos elementos se ven en la página. script, style, link y meta no. */
const VISIBLES_EN_HEAD = new Set([
  'a',
  'article',
  'aside',
  'audio',
  'button',
  'canvas',
  'div',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'iframe',
  'img',
  'input',
  'label',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'picture',
  'section',
  'select',
  'span',
  'svg',
  'table',
  'textarea',
  'ul',
  'video',
]);

const DOCUMENTO = new Set(['html', 'body', 'head']);

export type AvisoCodigo = 'documento' | 'visible';

export type MarcaCodigo =
  | { tipo: 'etiqueta'; desde: number; hasta: number; etiqueta: string; gravedad: 'error' }
  | { tipo: 'javascript'; desde: number; hasta: number; detalle: string; gravedad: 'error' }
  | { tipo: 'limite'; desde: number; hasta: number; gravedad: 'error' }
  | { tipo: 'documento'; desde: number; hasta: number; etiqueta: string; gravedad: 'aviso' }
  | { tipo: 'visible'; desde: number; hasta: number; etiqueta: string; gravedad: 'aviso' };

export interface InformeCodigo {
  marcas: MarcaCodigo[];
  /** Errores de sintaxis o el tope de caracteres. Los avisos no bloquean. */
  bloquea: boolean;
  avisos: AvisoCodigo[];
}

interface Abierta {
  nombre: string;
  desde: number;
  hasta: number;
}

type TraductorMarca = (clave: string, valores?: Record<string, string | number>) => string;

/** Texto de una marca, con las claves de `codigo.*`. */
export function textoMarcaCodigo(t: TraductorMarca, marca: MarcaCodigo): string {
  switch (marca.tipo) {
    case 'etiqueta':
      return t('codigo.errores.etiqueta', { etiqueta: marca.etiqueta });
    case 'javascript':
      return t('codigo.errores.javascript', { detalle: marca.detalle });
    case 'limite':
      return t('codigo.errores.limite', { max: LIMITE_CODIGO_MEDIDA });
    case 'documento':
      return t('codigo.avisoDocumento');
    case 'visible':
      return t('codigo.avisoHead');
  }
}

/** Las primeras líneas, solo para la vista previa. No recorta el valor guardado. */
export function vistaPreviaCodigo(codigo: string, lineas = 3): string {
  return codigo.split('\n').slice(0, lineas).join('\n');
}

/**
 * Etiquetas sin cerrar, JavaScript evidente, tope de caracteres y avisos.
 * Una cadena vacía no es un error de sintaxis: el diálogo ya pide el código.
 */
export function diagnosticarCodigo(codigo: string, posicion: PosicionCodigo): InformeCodigo {
  const marcas: MarcaCodigo[] = [];
  const pila: Abierta[] = [];
  const n = codigo.length;
  let i = 0;

  const sinCerrar = (abierta: Abierta) => {
    marcas.push({
      tipo: 'etiqueta',
      desde: abierta.desde,
      hasta: abierta.hasta,
      etiqueta: abierta.nombre,
      gravedad: 'error',
    });
  };

  const anotarDocumento = (nombre: string, desde: number, hasta: number) => {
    if (!DOCUMENTO.has(nombre)) return;
    marcas.push({ tipo: 'documento', desde, hasta, etiqueta: nombre, gravedad: 'aviso' });
  };

  const anotarVisible = (nombre: string, desde: number, hasta: number) => {
    if (posicion !== 'head' || !VISIBLES_EN_HEAD.has(nombre)) return;
    marcas.push({ tipo: 'visible', desde, hasta, etiqueta: nombre, gravedad: 'aviso' });
  };

  const cerrarPila = (nombre: string) => {
    let indice = pila.length - 1;
    while (indice >= 0 && pila[indice].nombre !== nombre) indice--;
    if (indice < 0) return;
    for (let j = pila.length - 1; j > indice; j--) sinCerrar(pila[j]);
    pila.length = indice;
  };

  while (i < n) {
    if (codigo.startsWith('<!--', i)) {
      const fin = codigo.indexOf('-->', i + 4);
      i = fin < 0 ? n : fin + 3;
      continue;
    }
    if (codigo.startsWith('<![CDATA[', i)) {
      const fin = codigo.indexOf(']]>', i + 9);
      i = fin < 0 ? n : fin + 3;
      continue;
    }
    if (codigo[i] === '<' && (codigo[i + 1] === '!' || codigo[i + 1] === '?')) {
      const fin = codigo.indexOf('>', i + 2);
      i = fin < 0 ? n : fin + 1;
      continue;
    }
    if (codigo[i] !== '<') {
      i++;
      continue;
    }

    const esCierre = codigo[i + 1] === '/';
    const inicioNombre = esCierre ? i + 2 : i + 1;
    const nombre = leerNombre(codigo, inicioNombre);
    if (!nombre) {
      i++;
      continue;
    }
    const nombreMin = nombre.toLowerCase();
    const despues = inicioNombre + nombre.length;
    const cierre = finDeEtiqueta(codigo, despues);
    const hastaNombre = despues;
    if (!cierre) {
      if (!esCierre) sinCerrar({ nombre: nombreMin, desde: i, hasta: hastaNombre });
      break;
    }

    if (esCierre) {
      anotarDocumento(nombreMin, i, hastaNombre);
      cerrarPila(nombreMin);
      i = cierre.fin;
      continue;
    }

    anotarDocumento(nombreMin, i, hastaNombre);
    anotarVisible(nombreMin, i, hastaNombre);
    const vacia = ETIQUETAS_VACIAS.has(nombreMin) || cierre.autocierre;
    if (vacia) {
      i = cierre.fin;
      continue;
    }

    if (ETIQUETAS_CRUDAS.has(nombreMin)) {
      const finCuerpo = indiceCierre(codigo, cierre.fin, nombreMin);
      if (nombreMin === 'script') {
        revisarJavaScript(codigo, cierre.fin, finCuerpo < 0 ? n : finCuerpo, codigo.slice(despues, cierre.fin - 1), marcas);
      }
      if (finCuerpo < 0) {
        sinCerrar({ nombre: nombreMin, desde: i, hasta: hastaNombre });
        break;
      }
      const finEtiqueta = finDeEtiqueta(codigo, finCuerpo + 2 + nombreMin.length);
      i = finEtiqueta?.fin ?? finCuerpo;
      continue;
    }

    pila.push({ nombre: nombreMin, desde: i, hasta: hastaNombre });
    i = cierre.fin;
  }

  for (const abierta of pila) sinCerrar(abierta);

  if (codigo.length > LIMITE_CODIGO_MEDIDA) {
    marcas.push({
      tipo: 'limite',
      desde: LIMITE_CODIGO_MEDIDA,
      hasta: codigo.length,
      gravedad: 'error',
    });
  }

  const avisos: AvisoCodigo[] = [];
  if (marcas.some((m) => m.tipo === 'documento')) avisos.push('documento');
  if (marcas.some((m) => m.tipo === 'visible')) avisos.push('visible');

  return {
    marcas,
    bloquea: marcas.some((m) => m.gravedad === 'error'),
    avisos,
  };
}

function leerNombre(codigo: string, i: number): string | null {
  const c = codigo.charCodeAt(i);
  const letra = (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
  if (!letra) return null;
  let j = i + 1;
  while (j < codigo.length) {
    const d = codigo.charCodeAt(j);
    const ok =
      (d >= 65 && d <= 90) ||
      (d >= 97 && d <= 122) ||
      (d >= 48 && d <= 57) ||
      d === 45 ||
      d === 58;
    if (!ok) break;
    j++;
  }
  return codigo.slice(i, j);
}

/** Desde el primer carácter tras el nombre hasta justo después de `>`. */
function finDeEtiqueta(codigo: string, desde: number): { fin: number; autocierre: boolean } | null {
  let i = desde;
  let comilla: '"' | "'" | null = null;
  while (i < codigo.length) {
    const c = codigo[i];
    if (comilla) {
      if (c === comilla) comilla = null;
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      comilla = c;
      i++;
      continue;
    }
    if (c === '>') {
      let k = i - 1;
      while (k >= desde && /\s/.test(codigo[k])) k--;
      return { fin: i + 1, autocierre: codigo[k] === '/' };
    }
    i++;
  }
  return null;
}

/** Índice de `</nombre`, o -1 si el elemento crudo no se cierra. */
function indiceCierre(codigo: string, desde: number, nombre: string): number {
  const buscado = `</${nombre}`;
  const lower = codigo.toLowerCase();
  let i = desde;
  while (i < lower.length) {
    const pos = lower.indexOf(buscado, i);
    if (pos < 0) return -1;
    const sig = lower[pos + buscado.length];
    if (sig === '>' || sig === '/' || (sig !== undefined && /\s/.test(sig))) return pos;
    i = pos + 1;
  }
  return -1;
}

/**
 * Solo scripts clásicos. `type="module"` y JSON-LD no se comprueban: `new Function`
 * no entiende `import` ni está hecho para JSON. El cuerpo se compila y no se llama.
 */
function revisarJavaScript(codigo: string, desde: number, hasta: number, atributos: string, marcas: MarcaCodigo[]) {
  if (!esJavaScriptClasico(atributos)) return;
  const cuerpo = codigo.slice(desde, hasta);
  if (!cuerpo.trim()) return;
  const detalle = errorDeSintaxis(cuerpo);
  if (!detalle) return;
  marcas.push({
    tipo: 'javascript',
    desde,
    hasta: Math.max(desde + 1, hasta),
    detalle,
    gravedad: 'error',
  });
}

function esJavaScriptClasico(atributos: string): boolean {
  const m = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/i.exec(atributos);
  if (!m) return true;
  const tipo = (m[1] ?? m[2] ?? m[3] ?? '').trim().toLowerCase();
  return (
    tipo === '' ||
    tipo === 'text/javascript' ||
    tipo === 'application/javascript' ||
    tipo === 'text/ecmascript' ||
    tipo === 'application/ecmascript' ||
    tipo === 'application/x-javascript'
  );
}

function errorDeSintaxis(cuerpo: string): string | null {
  try {
    // Compila para ver la sintaxis. No se invoca: el cuerpo no corre.
    // eslint-disable-next-line no-new-func
    new Function(cuerpo);
    return null;
  } catch (error) {
    return error instanceof SyntaxError ? error.message.split('\n')[0] : null;
  }
}
