/**
 * Búsqueda única de clientes — reglas compartidas (sin React ni Supabase).
 *
 * El servidor busca con la RPC `fn_clientes_buscar` (ver
 * `src/lib/services/customers/busquedaClientesService.ts`); el POS sin red
 * (Desktop, catálogo local) busca con `buscarClientesEnLista` de este archivo.
 * Las dos aplican EXACTAMENTE las mismas reglas; cada función de aquí es el
 * espejo de una función SQL (migraciones 20260929180000 y 20260929180100):
 *
 * | Aquí                     | SQL                                   |
 * |--------------------------|---------------------------------------|
 * | `normalizarBusqueda`     | `normalizar_busqueda`                 |
 * | `palabrasBusqueda`       | `fn_clientes_palabras`                |
 * | `textoBusquedaCliente`   | `fn_clientes_texto_busqueda` (columna generada `customers.search_text`) |
 * | `relevanciaCliente`      | el `case` de `fn_clientes_buscar_ids` |
 * | `compararResultados`     | `order by relevancia, nombre_orden collate "C", id` |
 *
 * Reglas:
 * 1. Normalizar: minúsculas, sin tildes ni diéresis (ñ → n), sin apóstrofos;
 *    lo que no sea [a-z0-9] pasa a espacio; espacios colapsados.
 * 2. Palabras: si el texto es solo dígitos y separadores («300 123 4567»,
 *    «1.234.567») es UNA palabra con sus dígitos; si no, se parte por espacios;
 *    cada trozo numérico queda en dígitos y el resto se parte por lo que no sea
 *    [a-z0-9] («Gómez, Ana» → gomez · ana). Sin repetidas, máximo 8.
 * 3. Coincide si TODAS las palabras aparecen en el texto de búsqueda del
 *    cliente (nombre, apellidos, razón social, nombre comercial, correo,
 *    teléfono y documento, más los dígitos de teléfono y documento).
 * 4. Relevancia: 0 documento o teléfono exacto · 1 el nombre empieza por el
 *    texto («val» → Valentina) · 2 cada palabra empieza una palabra del nombre
 *    («val» → Ana Valencia) · 3 el resto («val» → Duval, o solo en el correo).
 *    Luego nombre normalizado (orden binario) e id.
 * 5. Texto vacío = todos. Texto sin ninguna palabra útil («(,)») = ninguno.
 */

/** Letras que `unaccent` convierte y que NFD no descompone. */
const EQUIVALENCIAS: Record<string, string> = { 'ß': 'ss', 'æ': 'ae', 'œ': 'oe', 'ø': 'o', 'ł': 'l', 'đ': 'd', 'ð': 'd', 'þ': 'th', 'ı': 'i' };

function sinTildes(valor: string): string {
  return valor
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[ßæœøłđðþı]/g, (c) => EQUIVALENCIAS[c] ?? c)
    .replace(/['’]/g, '');
}

/** Espejo de `normalizar_busqueda`. */
export function normalizarBusqueda(valor: string | null | undefined): string {
  return sinTildes(valor ?? '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function digitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/[^0-9]/g, '');
}

/** Espejo de `fn_clientes_palabras`. */
export function palabrasBusqueda(consulta: string | null | undefined): string[] {
  const t = sinTildes(Array.from(consulta ?? '').slice(0, 200).join('')).replace(/[^a-z0-9.+()/-]+/g, ' ');
  const crudas =
    /^[0-9 .+()/-]+$/.test(t) && /[0-9]/.test(t)
      ? [digitos(t)]
      : t
          .trim()
          .split(/ +/)
          .flatMap((w) => (/^[0-9.+()/-]+$/.test(w) ? [digitos(w)] : w.replace(/[^a-z0-9]+/g, ' ').split(' ')));
  const unicas: string[] = [];
  for (const p of crudas) if (p && !unicas.includes(p)) unicas.push(p);
  return unicas.slice(0, 8);
}

/** Campos del cliente que entran en la búsqueda. */
export interface CamposBusquedaCliente {
  customer_type?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  trade_name?: string | null;
  email?: string | null;
  phone?: string | null;
  identification_number?: string | null;
}

/** `concat_ws(' ', …)`: omite los nulos, no los vacíos. */
function unir(...partes: (string | null | undefined)[]): string {
  return partes.filter((p): p is string => p != null).join(' ');
}

/** Espejo de `fn_clientes_texto_busqueda` (= `customers.search_text`). */
export function textoBusquedaCliente(c: CamposBusquedaCliente): string {
  const nombre =
    c.customer_type === 'company'
      ? unir(c.company_name, c.trade_name, c.first_name, c.last_name)
      : unir(c.first_name, c.last_name, c.company_name, c.trade_name);
  return (
    ' ' + normalizarBusqueda(nombre) +
    ' | ' + normalizarBusqueda(unir(c.email, c.phone, c.identification_number)) +
    ' :' + normalizarBusqueda(c.identification_number).replace(/ /g, '') + ':' +
    ' ;' + digitos(c.identification_number) + ';' +
    ' =' + digitos(c.phone) + '='
  );
}

/** Todas las palabras están en el texto de búsqueda. */
export function coincideCliente(texto: string, palabras: readonly string[]): boolean {
  return palabras.every((p) => texto.includes(p));
}

/** Espejo del `case` de relevancia de `fn_clientes_buscar_ids`. */
export function relevanciaCliente(texto: string, palabras: readonly string[]): 0 | 1 | 2 | 3 {
  const frase = palabras.join(' ');
  const compacto = palabras.join('');
  if (
    compacto &&
    (texto.includes(`:${compacto}:`) ||
      texto.includes(`;${compacto};`) ||
      texto.includes(`=${compacto}=`) ||
      (compacto.length >= 7 && /^[0-9]+$/.test(compacto) && texto.endsWith(`${compacto}=`)))
  ) {
    return 0;
  }
  if (frase && texto.startsWith(` ${frase}`)) return 1;
  // Solo hay un «|»: lo anterior es el nombre.
  const nombre = texto.slice(0, texto.indexOf('|'));
  if (palabras.length > 0 && palabras.every((p) => nombre.includes(` ${p}`))) return 2;
  return 3;
}

/** Orden binario (`collate "C"`): el texto normalizado es ASCII. */
function compararTexto(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface ResultadoOrdenable {
  id: string;
  relevancia: number;
  texto: string;
}

/** Espejo de `order by relevancia, nombre_orden collate "C", id`. */
export function compararResultados(a: ResultadoOrdenable, b: ResultadoOrdenable): number {
  return a.relevancia - b.relevancia || compararTexto(a.texto, b.texto) || compararTexto(a.id, b.id);
}

export interface PaginaClientes<T> {
  filas: T[];
  /** Coincidencias totales (no solo las de esta página). */
  total: number;
}

export const LIMITE_BUSQUEDA_CLIENTES = 20;

/**
 * La búsqueda completa sobre una lista en memoria (POS sin red): mismo filtro,
 * relevancia, orden, límite (1-100) y desplazamiento que `fn_clientes_buscar`.
 */
export function buscarClientesEnLista<T extends CamposBusquedaCliente & { id: string }>(
  filas: readonly T[],
  consulta: string | null | undefined,
  opciones: { limite?: number; desde?: number } = {},
): PaginaClientes<T & { relevancia: number }> {
  const limite = Math.min(Math.max(Math.trunc(opciones.limite ?? LIMITE_BUSQUEDA_CLIENTES), 1), 100);
  const desde = Math.min(Math.max(Math.trunc(opciones.desde ?? 0), 0), 100000);
  const vacia = !(consulta ?? '').trim();
  const palabras = palabrasBusqueda(consulta);
  if (!vacia && palabras.length === 0) return { filas: [], total: 0 };

  const encontrados: Array<ResultadoOrdenable & { fila: T }> = [];
  for (const fila of filas) {
    const texto = textoBusquedaCliente(fila);
    if (!coincideCliente(texto, palabras)) continue;
    encontrados.push({ id: fila.id, relevancia: relevanciaCliente(texto, palabras), texto, fila });
  }
  encontrados.sort(compararResultados);
  return {
    filas: encontrados.slice(desde, desde + limite).map((e) => ({ ...e.fila, relevancia: e.relevancia })),
    total: encontrados.length,
  };
}
