/**
 * Lógica pura de `CampoHora` (sin React): horas `HH:mm` del día, su rótulo en
 * el idioma activo y el movimiento con teclado por la lista.
 *
 * La hora es de reloj, sin zona: `CampoHora` trabaja con el mismo `HH:mm` que
 * el `value` de un `<input type="time">`, y quien la combina con un día decide
 * la zona (la de la organización).
 */

const HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function esHora(v: unknown): v is string {
  return typeof v === 'string' && HORA.test(v);
}

/** `HH:mm` o `HH:mm:ss` → `HH:mm`; cualquier otra cosa → ''. */
export function normalizarHora(v: string | null | undefined): string {
  if (!v) return '';
  const corto = v.slice(0, 5);
  return esHora(corto) ? corto : '';
}

/** Horas del día cada `paso` minutos (`00:00`, `00:15`…). */
export function horasDelDia(paso: number): string[] {
  const p = Number.isInteger(paso) && paso > 0 && paso <= 60 ? paso : 15;
  const lista: string[] = [];
  for (let m = 0; m < 24 * 60; m += p) {
    lista.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return lista;
}

/** Lista con `valor` incluido en su sitio si no cae en el paso (p. ej. 10:07 guardado antes). */
export function opcionesConValor(lista: readonly string[], valor: string, min?: string | null, max?: string | null): string[] {
  const base = lista.filter((h) => (!min || h >= min) && (!max || h <= max));
  return esHora(valor) && !base.includes(valor) ? [...base, valor].sort() : base;
}

/** «3:00 p. m.» / «15:00» según el idioma (reloj puro: se formatea en UTC para no mover la hora). */
export function etiquetaHora(hhmm: string, locale: string): string {
  if (!esHora(hhmm)) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, h, m)));
}

/** Opción con la que se abre la lista: la elegida o, sin valor, la más cercana a `referencia` (p. ej. 09:00). */
export function indiceInicial(opciones: readonly string[], valor: string, referencia = '09:00'): number {
  if (opciones.length === 0) return -1;
  const exacto = opciones.indexOf(valor);
  if (exacto >= 0) return exacto;
  const siguiente = opciones.findIndex((h) => h >= referencia);
  return siguiente >= 0 ? siguiente : opciones.length - 1;
}

/** Índice tras una tecla de navegación, o `null` si la tecla no mueve. */
export function moverIndice(actual: number, tecla: string, total: number, pagina = 4): number | null {
  if (total <= 0) return null;
  const acotar = (i: number) => Math.min(total - 1, Math.max(0, i));
  switch (tecla) {
    case 'ArrowDown':
      return acotar(actual + 1);
    case 'ArrowUp':
      return acotar(actual - 1);
    case 'PageDown':
      return acotar(actual + pagina);
    case 'PageUp':
      return acotar(actual - pagina);
    case 'Home':
      return 0;
    case 'End':
      return total - 1;
    default:
      return null;
  }
}

/** Escribir «14» o «2 p» salta a la primera hora que empieza así (24 h o con a. m./p. m.). */
export function buscarPorTexto(opciones: readonly string[], texto: string): number {
  const limpio = texto.trim().toLowerCase().replace(/\s+/g, '');
  if (!limpio) return -1;
  const digitos = limpio.match(/^(\d{1,2})(?::?(\d{0,2}))?/);
  if (!digitos) return -1;
  let hora = Number(digitos[1]);
  const pm = /p/.test(limpio);
  const am = /a/.test(limpio);
  if (pm && hora < 12) hora += 12;
  if (am && hora === 12) hora = 0;
  if (hora > 23) return -1;
  const prefijo = `${String(hora).padStart(2, '0')}:${digitos[2] ?? ''}`;
  return opciones.findIndex((h) => h.startsWith(prefijo));
}
