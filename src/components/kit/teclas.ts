/**
 * Atajos de teclado del kit, sin React: cómo se escribe una tecla en pantalla
 * (`Kbd`), cómo se anuncia (`aria-keyshortcuts`) y qué combinación trae un
 * evento de teclado (`useAtajos`).
 *
 * Una tecla se escribe como la dicen los documentos de diseño: «Ctrl+N»,
 * «Alt+1», «F9», «Supr», «Enter», «Esc», «↑↓». Se acepta también el nombre
 * en inglés o el de `KeyboardEvent.key` («Delete», «Escape», «ArrowUp»).
 */

/** Id canónico de una tecla: modificadores, teclas con nombre, F1–F12, letras y signos. */
export type IdTecla = string;

const MODIFICADORES = ['ctrl', 'alt', 'shift', 'meta'] as const;

/** Nombres aceptados (minúsculas, sin tildes) → id canónico. */
const ALIAS: Readonly<Record<string, IdTecla>> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  ctl: 'ctrl',
  cmd: 'meta',
  command: 'meta',
  meta: 'meta',
  win: 'meta',
  '⌘': 'meta',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
  altgr: 'alt',
  shift: 'shift',
  mayus: 'shift',
  maj: 'shift',
  enter: 'enter',
  intro: 'enter',
  return: 'enter',
  entree: 'enter',
  '↵': 'enter',
  esc: 'escape',
  escape: 'escape',
  supr: 'delete',
  suprimir: 'delete',
  suppr: 'delete',
  del: 'delete',
  delete: 'delete',
  backspace: 'backspace',
  retroceso: 'backspace',
  tab: 'tab',
  tabulador: 'tab',
  space: 'space',
  espacio: 'space',
  espace: 'space',
  espaco: 'space',
  spacebar: 'space',
  arrowup: 'arriba',
  up: 'arriba',
  arriba: 'arriba',
  '↑': 'arriba',
  arrowdown: 'abajo',
  down: 'abajo',
  abajo: 'abajo',
  '↓': 'abajo',
  arrowleft: 'izquierda',
  left: 'izquierda',
  izquierda: 'izquierda',
  '←': 'izquierda',
  arrowright: 'derecha',
  right: 'derecha',
  derecha: 'derecha',
  '→': 'derecha',
  home: 'inicio',
  inicio: 'inicio',
  end: 'fin',
  fin: 'fin',
};

const FLECHAS = new Set(['arriba', 'abajo', 'izquierda', 'derecha']);
const GLIFO_FLECHA: Readonly<Record<string, string>> = { arriba: '↑', abajo: '↓', izquierda: '←', derecha: '→' };

/** Teclas cuyo nombre cambia con el idioma (`kit.teclas.<id>`). */
export const TECLAS_CON_NOMBRE = ['enter', 'escape', 'delete', 'backspace', 'tab', 'space', 'shift', 'inicio', 'fin'] as const;
export type TeclaConNombre = (typeof TECLAS_CON_NOMBRE)[number];

/** Nombres por defecto (español) de las teclas con nombre. */
export const NOMBRES_TECLA_ES: Readonly<Record<TeclaConNombre, string>> = {
  enter: 'Enter',
  escape: 'Esc',
  delete: 'Supr',
  backspace: 'Retroceso',
  tab: 'Tab',
  space: 'Espacio',
  shift: 'Mayús',
  inicio: 'Inicio',
  fin: 'Fin',
};

/** Nombre de `aria-keyshortcuts` (valores de `KeyboardEvent.key`). */
const ARIA: Readonly<Record<string, string>> = {
  ctrl: 'Control',
  alt: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
  enter: 'Enter',
  escape: 'Escape',
  delete: 'Delete',
  backspace: 'Backspace',
  tab: 'Tab',
  space: 'Space',
  arriba: 'ArrowUp',
  abajo: 'ArrowDown',
  izquierda: 'ArrowLeft',
  derecha: 'ArrowRight',
  inicio: 'Home',
  fin: 'End',
};

function sinTildes(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Id canónico de un nombre de tecla suelto («Supr» → `delete`, «f9» → `f9`, «n» → `n`). */
export function idTecla(nombre: string): IdTecla {
  // La barra espaciadora llega como « » en `KeyboardEvent.key`.
  if (nombre === ' ') return 'space';
  const limpio = nombre.trim();
  if (!limpio) return '';
  const clave = sinTildes(limpio).toLowerCase();
  if (ALIAS[clave]) return ALIAS[clave];
  return clave;
}

/**
 * Partes de un atajo escrito: «Ctrl+N» → `['ctrl', 'n']`; «+» → `['+']`;
 * «↑↓» → `['arriba', 'abajo']` (dos teclas alternativas, no una combinación).
 */
export function partesAtajo(texto: string | null | undefined): IdTecla[] {
  const t = (texto ?? '').trim();
  if (!t) return [];
  if (t === '+') return ['+'];
  // «Ctrl++» = Ctrl y la tecla «+».
  const finalMas = t.endsWith('++');
  const cuerpo = finalMas ? t.slice(0, -2) : t;
  const trozos = cuerpo.split('+').map((p) => p.trim()).filter(Boolean);
  const partes: IdTecla[] = [];
  for (const trozo of trozos) {
    // Un grupo de flechas escrito junto («↑↓», «←→»).
    if (/^[↑↓←→]{2,}$/u.test(trozo)) {
      for (const glifo of Array.from(trozo)) partes.push(idTecla(glifo));
    } else {
      partes.push(idTecla(trozo));
    }
  }
  if (finalMas) partes.push('+');
  return partes;
}

/** true si el atajo es solo un grupo de flechas («↑↓»): se leen como alternativas. */
function soloFlechas(partes: readonly IdTecla[]): boolean {
  return partes.length > 1 && partes.every((p) => FLECHAS.has(p));
}

/**
 * Texto visible de un atajo en el idioma activo. `nombres` trae los de
 * `kit.teclas`; sin él, español. Las letras van en mayúscula y las flechas
 * como glifo: «Ctrl+N», «Alt+1», «Supr», «↑↓».
 */
export function etiquetaAtajo(
  texto: string | null | undefined,
  nombres: Partial<Record<TeclaConNombre, string>> = {},
): string {
  const partes = partesAtajo(texto);
  const etiqueta = (p: IdTecla): string => {
    if ((TECLAS_CON_NOMBRE as readonly string[]).includes(p)) {
      const id = p as TeclaConNombre;
      return nombres[id] ?? NOMBRES_TECLA_ES[id];
    }
    if (p === 'ctrl') return 'Ctrl';
    if (p === 'alt') return 'Alt';
    if (p === 'meta') return '⌘';
    if (GLIFO_FLECHA[p]) return GLIFO_FLECHA[p];
    if (/^f\d{1,2}$/.test(p)) return p.toUpperCase();
    return p.length === 1 ? p.toUpperCase() : p.charAt(0).toUpperCase() + p.slice(1);
  };
  if (soloFlechas(partes)) return partes.map(etiqueta).join('');
  return partes.map(etiqueta).join('+');
}

/**
 * Valor de `aria-keyshortcuts` («Ctrl+N» → «Control+N»; «↑↓» → «ArrowUp
 * ArrowDown», dos alternativas separadas por espacio). Vacío si no hay atajo.
 */
export function ariaAtajo(texto: string | null | undefined): string {
  const partes = partesAtajo(texto);
  const nombre = (p: IdTecla): string => {
    if (ARIA[p]) return ARIA[p];
    if (/^f\d{1,2}$/.test(p)) return p.toUpperCase();
    return p.length === 1 ? p.toUpperCase() : p;
  };
  if (soloFlechas(partes)) return partes.map(nombre).join(' ');
  return partes.map(nombre).join('+');
}

/** Clave comparable de un atajo escrito: modificadores en orden fijo y la tecla («Alt+1» → `alt+1`). */
export function claveAtajo(texto: string | null | undefined): string {
  const partes = partesAtajo(texto);
  const mods = MODIFICADORES.filter((m) => partes.includes(m));
  const resto = partes.filter((p) => !(MODIFICADORES as readonly string[]).includes(p));
  return [...mods, ...resto].join('+');
}

/** Lo que `useAtajos` necesita de un `KeyboardEvent`. */
export interface EventoTecla {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  metaKey?: boolean;
}

/**
 * Clave de la combinación que trae un evento, comparable con `claveAtajo`.
 * Con Alt o Ctrl se usa `code` para letras y dígitos: en macOS Alt+1 escribe
 * «¡» y en algunos teclados Ctrl cambia `key`. Mayúscula solo cuenta con una
 * tecla con nombre o junto a otro modificador (en «?» ya va implícita).
 */
export function claveDeEvento(e: EventoTecla): string {
  let tecla: IdTecla = idTecla(e.key ?? '');
  if ((e.altKey || e.ctrlKey || e.metaKey) && e.code) {
    const digito = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
    const letra = /^Key([A-Z])$/.exec(e.code);
    if (digito) tecla = digito[1];
    else if (letra) tecla = letra[1].toLowerCase();
  }
  if (!tecla || (MODIFICADORES as readonly string[]).includes(tecla)) return '';
  const conNombre = tecla.length > 1;
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('ctrl');
  if (e.altKey) mods.push('alt');
  if (e.shiftKey && (conNombre || e.ctrlKey || e.altKey || e.metaKey)) mods.push('shift');
  if (e.metaKey) mods.push('meta');
  return [...mods, tecla].join('+');
}

/** Un atajo con F1–F12, Escape, Alt, Ctrl o ⌘ se puede usar con el foco en un campo de texto. */
export function atajoValidoEnCampo(clave: string): boolean {
  const partes = clave.split('+');
  const tecla = partes[partes.length - 1];
  if (/^f\d{1,2}$/.test(tecla) || tecla === 'escape') return true;
  return partes.includes('alt') || partes.includes('ctrl') || partes.includes('meta');
}
