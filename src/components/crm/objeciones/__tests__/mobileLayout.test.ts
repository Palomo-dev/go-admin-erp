/// <reference types="jest" />
/**
 * UX móvil — ronda 1 (UXM-B): la hoja «Nueva objeción» a 375 px.
 *
 * Defecto reportado por el dueño (iPhone): bloque vacío de ~200 px bajo el
 * pie. Causa raíz medida con el arnés: la hoja (`fixed`, `overflow-y-auto`
 * por `sheetVariants`) era desplazable 30 px (scrollHeight 842 vs 812) porque
 * el botón `sr-only` de envío es `position:absolute` y, con el `<form>`
 * estático, su bloque contenedor era la hoja: quedaba después del contenido
 * desbordado del formulario. El teclado de iOS desplaza ese contenedor más
 * allá del final y no lo devuelve: el pie flotaba y debajo asomaba el fondo.
 *
 * Aquí se fija el cableado sobre el FUENTE (en jsdom no hay layout; el
 * layout real se midió con clic real en el navegador). Lectores tolerantes a
 * orden de clases, concatenación de literales y saltos de línea.
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SHEET = 'src/components/crm/objeciones/ObjectionEditorSheet.tsx';
const FOOTER = 'src/components/crm/objeciones/ObjectionEditorFooter.tsx';
const TOOLBAR = 'src/components/crm/objeciones/ObjectionsToolbar.tsx';
const CHIPS = 'src/components/crm/objeciones/CategoryChips.tsx';

/** Clases de `export const NAME = 'a b' + 'c d';` (o una sola cadena), en cualquier orden. */
function constClasses(src: string, name: string): string[] {
  const m = src.match(new RegExp(`\\b${name}\\s*=\\s*([\\s\\S]*?);`));
  if (!m) return [];
  const out: string[] = [];
  const re = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
  let lit: RegExpExecArray | null;
  while ((lit = re.exec(m[1]))) out.push(...lit[2].split(/\s+/).filter(Boolean));
  return out;
}
/** Etiqueta JSX de apertura `<Name …>` completa (llaves balanceadas). */
function openingTag(src: string, name: string): string {
  const i = src.search(new RegExp(`<${name}\\b`));
  if (i < 0) return '';
  let depth = 0;
  for (let j = i; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') depth -= 1;
    else if (src[j] === '>' && depth === 0) return src.slice(i, j + 1);
  }
  return '';
}
const hasAll = (list: string[], ...wanted: string[]) => wanted.every((w) => list.includes(w));

describe('hoja «Nueva objeción» a 375 px (UXM-B)', () => {
  const sheet = read(SHEET);
  const footer = read(FOOTER);

  it('la hoja no desplaza (overflow-hidden) y sigue al viewport dinámico (h-dvh), no a h-full', () => {
    const cls = constClasses(sheet, 'SHEET_CLASS');
    expect(hasAll(cls, 'flex', 'flex-col', 'h-dvh', 'max-h-dvh', 'overflow-hidden', 'w-full', 'p-0', 'gap-0')).toBe(true);
    expect(cls).not.toContain('overflow-y-auto');
    expect(cls).not.toContain('h-full');
    expect(openingTag(sheet, 'SheetContent')).toMatch(/className=\{SHEET_CLASS\}/);
  });

  it('solo el cuerpo desplaza: flex-1 min-h-0 overflow-y-auto y relative (contiene al botón sr-only)', () => {
    const cls = constClasses(sheet, 'BODY_CLASS');
    expect(hasAll(cls, 'relative', 'flex-1', 'min-h-0', 'overflow-y-auto')).toBe(true);
    expect(openingTag(sheet, 'form')).toMatch(/className=\{BODY_CLASS\}/);
    // El botón de envío implícito sigue existiendo (Enter en el título guarda) y sigue oculto.
    expect(openingTag(sheet, 'button')).toMatch(/type="submit"/);
    expect(openingTag(sheet, 'button')).toMatch(/sr-only/);
  });

  it('la cabecera no se estira ni se centra en móvil y deja sitio a la X de cerrar', () => {
    const header = openingTag(sheet, 'SheetHeader');
    expect(header).toMatch(/\bshrink-0\b/);
    expect(header).toMatch(/\btext-left\b/);
    // Sin prefijo de breakpoint: `\bpr-12\b` también casaba con `sm:pr-12` y la mutación
    // «quitar el pr-12 móvil» sobrevivía (tester UXM-B). La X va a `right-4` en todos los tamaños.
    expect(header).toMatch(/(?<![:\w-])pr-12\b/);
    expect(header).toMatch(/\bsm:pr-12\b/);
  });

  it('el pie está extraído, es una sola fila que envuelve, no se encoge y respeta la safe area', () => {
    expect(sheet).toMatch(/from\s*['"]\.\/ObjectionEditorFooter['"]/);
    expect(openingTag(sheet, 'ObjectionEditorFooter')).not.toBe('');
    expect(sheet).not.toMatch(/<SheetFooter\b/);
    const cls = constClasses(footer, 'FOOTER_CLASS');
    // `sm:justify-between` es obligatorio: el `SheetFooter` base trae `sm:justify-end` y, sin él, en
    // escritorio el interruptor se pegaba a los botones (regresión vista en la ronda 1).
    expect(
      hasAll(cls, 'flex-row', 'flex-wrap', 'items-center', 'justify-between', 'sm:justify-between', 'shrink-0'),
    ).toBe(true);
    // El grupo de botones lleva `ml-auto`: si el pie envuelve a 375 px, los botones quedan a la derecha.
    expect(footer).toMatch(/className="[^"]*\bml-auto\b[^"]*"/);
    expect(cls.some((c) => c === 'flex-col' || c === 'flex-col-reverse')).toBe(false);
    expect(cls.some((c) => /^pb-\[calc\(.*env\(safe-area-inset-bottom\)\)\]$/.test(c))).toBe(true);
    expect(openingTag(footer, 'SheetFooter')).toMatch(/className=\{FOOTER_CLASS\}/);
  });

  it('el interruptor «Activa» vive en el pie con su Label y estado en texto', () => {
    const sw = openingTag(footer, 'Switch');
    expect(sw).toMatch(/id="objection-active"/);
    expect(openingTag(footer, 'Label')).toMatch(/htmlFor="objection-active"/);
    expect(footer).toMatch(/'Activa'\s*:\s*'Inactiva'/);
  });

  it('objetivo táctil ≥ 44 px: el Label envuelve al Switch y mide min-h-11 (tester UXM-B)', () => {
    // El `Switch` mide 36×20; medido en el navegador a 375 px, el objetivo era de 20 px de alto.
    // Con el Label (min-h-11 = 44 px) envolviendo al interruptor, el objetivo medido es 96×44.
    const label = openingTag(footer, 'Label');
    expect(label).toMatch(/\bmin-h-11\b/);
    expect(label).toMatch(/\bcursor-pointer\b/);
    expect(footer.indexOf('<Label')).toBeLessThan(footer.indexOf('<Switch'));
    expect(footer.indexOf('<Switch')).toBeLessThan(footer.indexOf('</Label>'));
  });

  it('las tres franjas usan px-4 en móvil y px-6 desde sm', () => {
    expect(hasAll(constClasses(sheet, 'BODY_CLASS'), 'px-4', 'sm:px-6')).toBe(true);
    expect(hasAll(constClasses(footer, 'FOOTER_CLASS'), 'px-4', 'sm:px-6')).toBe(true);
    expect(openingTag(sheet, 'SheetHeader')).toMatch(/\bpx-4\b[\s\S]*\bsm:px-6\b/);
  });
});

describe('chips a 375 px', () => {
  it('los chips de categoría del editor y los filtros de la barra envuelven con el mismo gap-1.5', () => {
    const chips = read(CHIPS);
    expect(chips).toMatch(/className="flex flex-wrap gap-1\.5"/);
    const toolbar = read(TOOLBAR);
    const groups = toolbar.match(/role="group"[^>]*className="([^"]*)"/g) ?? [];
    expect(groups.length).toBe(2);
    for (const g of groups) {
      expect(g).toMatch(/\bflex-wrap\b/);
      expect(g).toMatch(/\bgap-1\.5\b/);
      expect(g).not.toMatch(/\bgap-1\b(?!\.)/);
    }
  });
});
